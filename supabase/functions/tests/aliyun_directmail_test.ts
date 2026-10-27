import {
  AliyunDirectMailError,
  canonicalizeParameters,
  createStringToSign,
  percentEncode,
  sendSingleEmail,
  signRpcRequest,
} from "../_shared/aliyunDirectMail.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const officialSignatureParameters = {
  AccessKeyId: "testid",
  AccountName: "<a%b'>",
  Action: "SingleSendMail",
  AddressType: "1",
  Format: "XML",
  HtmlBody: "4",
  RegionId: "cn-hangzhou",
  ReplyToAddress: "true",
  SignatureMethod: "HMAC-SHA1",
  SignatureNonce: "c1b2c332-4cfb-4a0f-b8cc-ebe622aa0a5c",
  SignatureVersion: "1.0",
  Subject: "3",
  TagName: "2",
  Timestamp: "2016-10-20T06:27:56Z",
  ToAddress: "1@test.com",
  Version: "2015-11-23",
};

Deno.test("DirectMail canonicalization and HMAC-SHA1 match the official vector", async () => {
  assert(
    percentEncode("a b!*'()~") === "a%20b%21%2A%27%28%29~",
    "RFC3986 percent encoding is incorrect",
  );
  const canonical = canonicalizeParameters(officialSignatureParameters);
  assert(
    canonical.startsWith(
      "AccessKeyId=testid&AccountName=%3Ca%25b%27%3E&Action=",
    ),
    "parameters were not sorted and encoded canonically",
  );
  assert(
    createStringToSign(officialSignatureParameters) ===
      "POST&%2F&AccessKeyId%3Dtestid%26AccountName%3D%253Ca%2525b%2527%253E%26Action%3DSingleSendMail%26AddressType%3D1%26Format%3DXML%26HtmlBody%3D4%26RegionId%3Dcn-hangzhou%26ReplyToAddress%3Dtrue%26SignatureMethod%3DHMAC-SHA1%26SignatureNonce%3Dc1b2c332-4cfb-4a0f-b8cc-ebe622aa0a5c%26SignatureVersion%3D1.0%26Subject%3D3%26TagName%3D2%26Timestamp%3D2016-10-20T06%253A27%253A56Z%26ToAddress%3D1%2540test.com%26Version%3D2015-11-23",
    "string-to-sign does not match the official DirectMail example",
  );
  assert(
    await signRpcRequest(officialSignatureParameters, "testsecret") ===
      "llJfXJjBW3OacrVgxxsITgYaYm0=",
    "HMAC-SHA1 signature does not match the official DirectMail example",
  );
});

Deno.test("sendSingleEmail posts a signed request and parses provider identifiers", async () => {
  let capturedUrl = "";
  let capturedRequest: RequestInit | undefined;
  const result = await sendSingleEmail({
    accessKeyId: "testid",
    accessKeySecret: "testsecret",
    toAddress: "pilot@example.com",
    subject: "DOSO 登录提醒",
    htmlBody: "<strong>安全提醒</strong>",
    notificationId: "11111111-1111-4111-8111-111111111111",
  }, {
    now: () => new Date("2026-08-25T01:02:03.456Z"),
    randomUUID: () => "11111111-2222-4333-8444-555555555555",
    fetch: (input, init) => {
      capturedUrl = String(input);
      capturedRequest = init;
      return Promise.resolve(Response.json({
        RequestId: "request-123",
        EnvId: "env-456",
      }));
    },
  });

  assert(
    JSON.stringify(result) ===
      '{"requestId":"request-123","envId":"env-456"}',
    "provider identifiers were not parsed",
  );
  assert(capturedUrl === "https://dm.aliyuncs.com/", "wrong API endpoint");
  assert(capturedRequest?.method === "POST", "request was not POST");
  const headers = new Headers(capturedRequest?.headers);
  assert(
    headers.get("content-type") ===
      "application/x-www-form-urlencoded; charset=utf-8",
    "wrong request content type",
  );
  const body = String(capturedRequest?.body);
  assert(body.includes("Action=SingleSendMail"), "action was omitted");
  assert(
    body.includes("AccountName=no-reply%40auth.dosorobotics.com"),
    "default sender was omitted",
  );
  assert(body.includes("FromAlias=DOSO"), "default sender alias was omitted");
  assert(body.includes("ClickTrace=0"), "tracking must be explicitly disabled");
  assert(body.includes("Headers="), "custom correlation headers were omitted");
  assert(body.includes("Format=JSON"), "JSON response format was omitted");
  const decodedBody = decodeURIComponent(body);
  assert(
    decodedBody.includes(
      '"Message-ID":"<11111111-1111-4111-8111-111111111111@notify.dosorobotics.com>"',
    ),
    "deterministic Message-ID was omitted",
  );
  assert(
    decodedBody.includes(
      '"X-User-Notify-Doso-ID":"11111111-1111-4111-8111-111111111111"',
    ),
    "notification correlation header was omitted",
  );
  assert(body.includes("RegionId=cn-hangzhou"), "default region was omitted");
  assert(
    body.includes("Timestamp=2026-08-25T01%3A02%3A03Z"),
    "timestamp was not UTC without milliseconds",
  );
  assert(
    body.includes("SignatureNonce=11111111-2222-4333-8444-555555555555"),
    "nonce was not generated",
  );
  assert(body.includes("Signature="), "request was not signed");
  assert(!body.includes("testsecret"), "AccessKeySecret leaked into the body");
});

Deno.test("sendSingleEmail rejects invalid inputs before network access", async () => {
  let fetchCalled = false;
  let caught: unknown;
  try {
    await sendSingleEmail({
      accessKeyId: "testid",
      accessKeySecret: "testsecret",
      toAddress: "first@example.com,second@example.com",
      subject: "subject",
      htmlBody: "<p>body</p>",
      notificationId: "11111111-1111-4111-8111-111111111111",
    }, {
      fetch: () => {
        fetchCalled = true;
        return Promise.resolve(Response.json({}));
      },
    });
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof AliyunDirectMailError, "invalid input was accepted");
  assert(caught.code === "invalid_request", "wrong validation error code");
  assert(!fetchCalled, "network was called for invalid input");
});

Deno.test("DirectMail provider and transport failures redact credentials and addresses", async () => {
  const secret = "super-secret-value";
  const accessKeyId = "LTAI5tSensitiveAccessKey";
  const sender = "no-reply@auth.dosorobotics.com";
  const recipient = "private-recipient@example.com";
  const errorMessages: string[] = [];

  for (
    const fetchMock of [
      () =>
        Promise.resolve(Response.json({
          Code: "SignatureDoesNotMatch",
          Message:
            `bad AccessKeySecret=${secret} ${secret}; AccessKeyId=${accessKeyId}; AccountName=${sender}; ToAddress=${recipient}`,
          RequestId: "request-failed",
        }, { status: 400 })),
      () => Promise.reject(new Error(`socket failed for ${secret}`)),
    ]
  ) {
    try {
      await sendSingleEmail({
        accessKeyId,
        accessKeySecret: secret,
        accountName: sender,
        toAddress: recipient,
        subject: "subject",
        htmlBody: "<p>body</p>",
        notificationId: "11111111-1111-4111-8111-111111111111",
      }, { fetch: fetchMock });
    } catch (error) {
      assert(error instanceof AliyunDirectMailError, "wrong error type");
      errorMessages.push(error.message);
    }
  }

  assert(errorMessages.length === 2, "expected both requests to fail");
  assert(
    errorMessages.every((message) =>
      !message.includes(secret) &&
      !message.includes(accessKeyId) &&
      !message.includes(sender) &&
      !message.includes(recipient)
    ),
    "a credential or address leaked through an error message",
  );
  assert(
    errorMessages[0].includes("[REDACTED]"),
    "provider error was not explicitly redacted",
  );
});
