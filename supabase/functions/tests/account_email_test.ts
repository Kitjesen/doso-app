import {
  AccountEmailRenderError,
  escapeHtml,
  isAccountEmailKindEnabled,
  renderAccountEmail,
} from "../_shared/accountEmail.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectRenderError(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    assert(error instanceof AccountEmailRenderError, "wrong render error type");
    assert(error.code === code, `expected ${code}, received ${error.code}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

const newDevicePayload = {
  event_time: "2026-08-25 09:00:00 Asia/Shanghai",
  device: "android · Pixel",
  security_url: "https://dosorobotics.com/account/security",
};

Deno.test("all four designed account templates render with strict payloads", () => {
  const rendered = [
    renderAccountEmail("new_device_login", newDevicePayload),
    renderAccountEmail("anomalous_login", {
      account_email: "pilot@example.com",
      event_time: "now",
      location: "unknown",
      device: "unknown",
      security_url: "https://dosorobotics.com/account/security",
    }),
    renderAccountEmail("account_deletion_confirmation", {
      deletion_confirmation_url:
        "https://dosorobotics.com/account/delete/confirm?token=test-only",
    }),
    renderAccountEmail("account_deleted", {
      account_email: "pilot@example.com",
      event_time: "now",
    }),
  ];
  assert(
    rendered.every((item) => !item.html.includes("{{")),
    "placeholder remained",
  );
});

Deno.test("renderer escapes untrusted values and validates approved links", () => {
  const rendered = renderAccountEmail("new_device_login", {
    event_time: "now & later",
    device: '<img src=x onerror="alert(1)">',
    security_url: "https://dosorobotics.com/account/security?from=email&step=1",
  });
  assert(rendered.html.includes("now &amp; later"), "text was not escaped");
  assert(!rendered.html.includes("<img src=x"), "HTML injection remained");
  assert(
    rendered.html.includes("?from=email&amp;step=1"),
    "URL was not escaped",
  );
  expectRenderError(
    () =>
      renderAccountEmail("new_device_login", {
        ...newDevicePayload,
        security_url: "https://dosorobotics.com.evil.test/account/security",
      }),
    "invalid_email_url",
  );
  expectRenderError(
    () =>
      renderAccountEmail("new_device_login", {
        ...newDevicePayload,
        security_url: "https://dosorobotics.com/account/delete/confirm",
      }),
    "invalid_email_url",
  );
  expectRenderError(
    () =>
      renderAccountEmail("account_deletion_confirmation", {
        deletion_confirmation_url: "https://dosorobotics.com/account/security",
      }),
    "invalid_email_url",
  );
  expectRenderError(
    () =>
      renderAccountEmail("account_deletion_confirmation", {
        deletion_confirmation_url:
          "https://dosorobotics.com/account/delete/confirm#token",
      }),
    "invalid_email_url",
  );
  assert(
    escapeHtml(`&<>"'`) === "&amp;&lt;&gt;&quot;&#39;",
    "escaping incomplete",
  );
});

Deno.test("runtime enables only new-device email regardless of environment", () => {
  const allTrue = () => "true";
  assert(
    isAccountEmailKindEnabled("new_device_login", allTrue),
    "runtime kind disabled",
  );
  assert(
    !isAccountEmailKindEnabled("anomalous_login", allTrue),
    "anomaly enabled",
  );
  assert(
    !isAccountEmailKindEnabled("account_deleted", allTrue),
    "deletion enabled",
  );
});
