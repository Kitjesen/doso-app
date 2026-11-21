export const corsHeaders = {
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info, x-request-id",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "86400",
} as const;

export function parseAllowedWebOrigins(
  allowedOrigins: string | undefined,
  legacyOrigin: string | undefined,
): string[] {
  const values = allowedOrigins
    ? allowedOrigins.split(",")
    : legacyOrigin
    ? [legacyOrigin]
    : [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function isOriginAllowed(
  origin: string | null,
  allowedOrigins: readonly string[],
  allowAllWebOriginsForLocalDevelopment = false,
): boolean {
  return origin === null || allowAllWebOriginsForLocalDevelopment ||
    allowedOrigins.includes(origin);
}

export function localWebOriginEscapeEnabled(
  value: string | undefined,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

type CorsPolicy = {
  allowedOrigins: string[];
  allowAllWebOriginsForLocalDevelopment: boolean;
};

function configuredCorsPolicy(): CorsPolicy {
  return {
    allowedOrigins: parseAllowedWebOrigins(
      Deno.env.get("DOSO_ALLOWED_WEB_ORIGINS"),
      Deno.env.get("DOSO_ALLOWED_ADMIN_ORIGIN"),
    ),
    allowAllWebOriginsForLocalDevelopment: localWebOriginEscapeEnabled(
      Deno.env.get("DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV"),
    ),
  };
}

function corsResponse(
  response: Response,
  origin: string | null,
  originAllowed: boolean,
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  if (origin && originAllowed) {
    headers.set("access-control-allow-origin", origin);
    headers.append("vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }, error.status);
  }

  console.error(error);
  return json({
    error: {
      code: "internal_error",
      message: "The server could not complete the request.",
    },
  }, 500);
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (request.method === "GET") return {};
  try {
    const value = await request.json();
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(
      400,
      "invalid_json",
      "Request body must be a JSON object.",
    );
  }
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
  maxLength = 200,
): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "invalid_request", `${key} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new HttpError(400, "invalid_request", `${key} is too long.`);
  }
  return normalized;
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength = 200,
): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new HttpError(
      400,
      "invalid_request",
      `${key} must be a string no longer than ${maxLength} characters.`,
    );
  }
  return value.trim();
}

export function positiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  const number = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(number) && (number as number) > 0
    ? Math.min(number as number, maximum)
    : fallback;
}

export async function handle(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const origin = request.headers.get("origin");
  const policy = configuredCorsPolicy();
  const originAllowed = isOriginAllowed(
    origin,
    policy.allowedOrigins,
    policy.allowAllWebOriginsForLocalDevelopment,
  );
  try {
    if (!originAllowed) {
      throw new HttpError(
        403,
        "origin_not_allowed",
        "This browser origin is not allowed.",
      );
    }
    if (request.method === "OPTIONS") {
      return corsResponse(
        new Response(null, { status: 204 }),
        origin,
        originAllowed,
      );
    }
    return corsResponse(await handler(), origin, originAllowed);
  } catch (error) {
    return corsResponse(errorResponse(error), origin, originAllowed);
  }
}
