import {
  ACCOUNT_EMAIL_TEMPLATES,
  type AccountEmailTemplateId,
} from "./generatedAccountEmailTemplates.ts";

const DOSO_LINK_HOST = "dosorobotics.com";
const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;
const DOSO_LINK_PATHS: Readonly<Record<string, string>> = {
  security_url: "/account/security",
  deletion_confirmation_url: "/account/delete/confirm",
};

export class AccountEmailRenderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AccountEmailRenderError";
  }
}

export type RenderedAccountEmail = {
  kind: AccountEmailTemplateId;
  subject: string;
  html: string;
};

export function isAccountEmailTemplateId(
  value: string,
): value is AccountEmailTemplateId {
  return Object.hasOwn(ACCOUNT_EMAIL_TEMPLATES, value);
}

export function isAccountEmailKindEnabled(
  kind: AccountEmailTemplateId,
  _readEnvironment: (name: string) => string | undefined = (name) =>
    Deno.env.get(name),
): boolean {
  return kind === "new_device_login";
}

export function renderAccountEmail(
  kind: string,
  payload: unknown,
): RenderedAccountEmail {
  if (!isAccountEmailTemplateId(kind)) {
    throw new AccountEmailRenderError(
      "unknown_email_kind",
      "The account email kind is not supported.",
    );
  }
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    throw new AccountEmailRenderError(
      "invalid_email_payload",
      "The account email payload must be an object.",
    );
  }

  const template = ACCOUNT_EMAIL_TEMPLATES[kind];
  const values = payload as Record<string, unknown>;
  const allowed = new Set<string>(template.variables);
  const actualKeys = Object.keys(values);
  const unexpected = actualKeys.filter((key) => !allowed.has(key));
  const missing = template.variables.filter((key) => !(key in values));
  if (unexpected.length || missing.length) {
    throw new AccountEmailRenderError(
      "invalid_email_payload",
      "The account email payload does not match the template allowlist.",
    );
  }

  const urlVariables = new Set<string>(template.urlVariables);
  let html: string = template.html;
  for (const variable of template.variables) {
    const raw = values[variable];
    if (typeof raw !== "string" || !raw.trim()) {
      throw new AccountEmailRenderError(
        "invalid_email_payload",
        `The ${variable} field must be a non-empty string.`,
      );
    }
    const normalized = raw.trim();
    const maximum = urlVariables.has(variable)
      ? MAX_URL_LENGTH
      : MAX_TEXT_LENGTH;
    if (normalized.length > maximum) {
      throw new AccountEmailRenderError(
        "invalid_email_payload",
        `The ${variable} field is too long.`,
      );
    }
    if (urlVariables.has(variable)) validateDosoHttpsUrl(normalized, variable);
    html = html.split(`{{${variable}}}`).join(escapeHtml(normalized));
  }

  if (/\{\{[a-z][a-z0-9_]*\}\}/i.test(html)) {
    throw new AccountEmailRenderError(
      "unresolved_email_template",
      "The account email template contains an unresolved variable.",
    );
  }
  return { kind, subject: template.subject, html };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function validateDosoHttpsUrl(value: string, field: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AccountEmailRenderError(
      "invalid_email_url",
      `The ${field} field must be an absolute HTTPS URL.`,
    );
  }
  const hostname = url.hostname.toLowerCase();
  const isDosoHost = hostname === DOSO_LINK_HOST ||
    hostname.endsWith(`.${DOSO_LINK_HOST}`);
  const expectedPath = DOSO_LINK_PATHS[field];
  if (
    url.protocol !== "https:" || !isDosoHost || url.username || url.password ||
    (url.port && url.port !== "443") || !expectedPath ||
    url.pathname !== expectedPath || url.hash
  ) {
    throw new AccountEmailRenderError(
      "invalid_email_url",
      `The ${field} field must use its approved DOSO HTTPS route.`,
    );
  }
}
