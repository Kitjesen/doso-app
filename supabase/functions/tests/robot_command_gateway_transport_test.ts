import { createRobotCommandGatewayTransport } from "../robot-command-worker/gatewayTransport.ts";
import {
  type PublishedCommand,
  RobotCommandWorkerConfigurationError,
} from "../robot-command-worker/workerCore.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const API_KEY = "gateway-test-credential-never-log";
const ENDPOINT = "https://gateway.doso.test/v1/commands";
const publishedCommand = {
  command: {
    protocol_version: 1,
    command_id: "11111111-1111-4111-8111-111111111111",
    device_id: "22222222-2222-4222-8222-222222222222",
    owner_account_id: "33333333-3333-4333-8333-333333333333",
    terminal_id: "44444444-4444-4444-8444-444444444444",
    actor_user_id: "33333333-3333-4333-8333-333333333333",
    authorization_epoch: 3,
    idempotency_key: "health-check-1",
    auth_session_id: "55555555-5555-4555-8555-555555555555",
    policy_version: 1,
    safety_contract_id: "stationary-health-check",
    safety_contract_version: 1,
    capability: "command:diagnostics.health_check",
    kind: "diagnostics.health_check",
    command_class: "non_motion_diagnostic",
    may_actuate: false,
    expected_state: { authorization_epoch: 3, boot_id: "boot-alpha" },
    issued_at_ms: 1_800_000_000_000,
    expires_at_ms: 1_800_000_030_000,
    payload: { include: ["battery", "network", "sensors"] },
  },
  signature_b64url: "signed-command-value",
} as const satisfies PublishedCommand;

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    DOSO_ROBOT_COMMAND_GATEWAY_URL: ENDPOINT,
    DOSO_ROBOT_COMMAND_GATEWAY_API_KEY: API_KEY,
    ...overrides,
  };
  return (name: string) => values[name];
}

Deno.test("gateway transport stays unconfigured until both values exist", () => {
  const empty = createRobotCommandGatewayTransport(() => undefined);
  assert(empty === null, "empty configuration created a transport");

  for (const overrides of [
    { DOSO_ROBOT_COMMAND_GATEWAY_URL: ENDPOINT, DOSO_ROBOT_COMMAND_GATEWAY_API_KEY: undefined },
    { DOSO_ROBOT_COMMAND_GATEWAY_URL: undefined, DOSO_ROBOT_COMMAND_GATEWAY_API_KEY: API_KEY },
    { DOSO_ROBOT_COMMAND_GATEWAY_URL: "http://gateway.doso.test/v1/commands" },
  ]) {
    let error: unknown;
    try {
      createRobotCommandGatewayTransport(environment(overrides));
    } catch (caught) {
      error = caught;
    }
    assert(
      error instanceof RobotCommandWorkerConfigurationError &&
        error.code === "transport_configuration_error",
      "invalid gateway configuration did not fail closed",
    );
  }
});

Deno.test("gateway transport publishes the exact signed command once", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const transport = createRobotCommandGatewayTransport(
    environment(),
    async (input, init) => {
      observedUrl = String(input);
      observedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        transport_message_id: "mqtt-qos1-0001",
      }), { status: 202, headers: { "content-type": "application/json" } });
    },
  );
  assert(transport !== null, "valid gateway configuration was rejected");
  const signal = new AbortController().signal;
  const result = await transport.publish(publishedCommand, { signal });

  assert(observedUrl === ENDPOINT, "gateway endpoint changed");
  assert(observedInit?.method === "POST", "gateway request was not POST");
  const headers = new Headers(observedInit?.headers);
  assert(headers.get("authorization") === `Bearer ${API_KEY}`, "gateway credential was missing");
  assert(headers.get("idempotency-key") === "health-check-1", "idempotency key was missing");
  assert(headers.get("x-doso-command-id") === publishedCommand.command.command_id, "command id was missing");
  assert(observedInit?.signal === signal, "worker deadline signal was not forwarded");
  assert(typeof observedInit?.body === "string", "gateway body was not serialized");
  const body = JSON.parse(observedInit.body);
  assert(body.protocol_version === 1, "gateway protocol changed");
  assert(body.command.command_id === publishedCommand.command.command_id, "gateway command changed");
  assert(body.signature_b64url === publishedCommand.signature_b64url, "gateway signature changed");
  assert(!observedInit.body.includes(API_KEY), "gateway credential leaked into the command body");
  assert(
    result.disposition === "published" && result.transportMessageId === "mqtt-qos1-0001",
    "accepted gateway receipt was not published",
  );
});

Deno.test("only an explicit pre-publish rejection is definitely not delivered", async () => {
  const transport = createRobotCommandGatewayTransport(
    environment(),
    async () => new Response(JSON.stringify({
      accepted: false,
      definitely_not_delivered: true,
      error_code: "device_topic_unknown",
    }), { status: 422 }),
  );
  assert(transport !== null, "transport was unexpectedly unconfigured");
  const result = await transport.publish(publishedCommand, {
    signal: new AbortController().signal,
  });
  assert(
    result.disposition === "transport_failure" &&
      result.definitelyNotDelivered === true &&
      result.errorCode === "device_topic_unknown",
    "proven gateway rejection was not classified as definitely not delivered",
  );
});

Deno.test("ambiguous gateway outcomes never become automatic retries", async () => {
  const cases = [
    async () => new Response("upstream failed", { status: 503 }),
    async () => new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    async () => new Response(JSON.stringify({
      accepted: false,
      error_code: "device_topic_unknown",
    }), { status: 422 }),
    async () => {
      throw new DOMException("deadline", "AbortError");
    },
  ];
  const expected = [
    "gateway_unavailable",
    "gateway_response_invalid",
    "gateway_rejection_unproven",
    "gateway_publish_timeout",
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const transport = createRobotCommandGatewayTransport(environment(), cases[index]);
    assert(transport !== null, "transport was unexpectedly unconfigured");
    const result = await transport.publish(publishedCommand, {
      signal: new AbortController().signal,
    });
    assert(
      result.disposition === "delivery_unknown" && result.errorCode === expected[index],
      `ambiguous gateway case ${index} was misclassified`,
    );
  }
});

Deno.test("chunked gateway responses are cancelled at the byte limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(12 * 1024));
      controller.enqueue(new Uint8Array(8 * 1024));
      controller.enqueue(new Uint8Array(8 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const transport = createRobotCommandGatewayTransport(
    environment(),
    async () => new Response(stream, { status: 202 }),
  );
  assert(transport !== null, "transport was unexpectedly unconfigured");
  const result = await transport.publish(publishedCommand, {
    signal: new AbortController().signal,
  });
  assert(cancelled, "oversized chunked response was not cancelled");
  assert(
    result.disposition === "delivery_unknown" &&
      result.errorCode === "gateway_response_invalid",
    "oversized chunked response was not rejected",
  );
});
