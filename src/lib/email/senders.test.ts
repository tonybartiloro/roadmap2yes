import { describe, expect, it, vi } from "vitest";
import { emailEnabled, getEmailSender, NullSender } from "./index";
import { ResendSender } from "./resend";
import { SmtpSender } from "./smtp";

const message = {
  to: "jessica@example.test",
  subject: "Ciao\r\nBcc: x@example.test",
  html: "<p>x</p>",
  text: "x",
  headers: { "List-Unsubscribe": "<https://a.example.test/u>\r\nX: y" },
  idempotencyKey: "batch-1",
};

describe("emailEnabled", () => {
  const cases: [string, Record<string, string>, boolean][] = [
    ["absent", {}, false],
    ["none", { EMAIL_TRANSPORT: "none" }, false],
    ["resend without key", { EMAIL_TRANSPORT: "resend", EMAIL_FROM: "a <n@example.test>" }, false],
    ["resend without from", { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "k" }, false],
    [
      "resend complete",
      { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "a <n@example.test>" },
      true,
    ],
    ["smtp", { EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1" }, true],
    ["smtp without host", { EMAIL_TRANSPORT: "smtp" }, false],
  ];
  it.each(cases)("%s", (_name, env, expected) => {
    expect(emailEnabled(env)).toBe(expected);
  });

  it("returns a NullSender that sends nothing when off", async () => {
    const sender = getEmailSender({});
    expect(sender).toBeInstanceOf(NullSender);
    expect(await sender.send({ to: "a@example.test", subject: "s", html: "h", text: "t" })).toEqual(
      { ok: false, error: "email_disabled", retryable: false },
    );
  });
  it("picks the transport from the env", () => {
    expect(getEmailSender({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1" }).transport).toBe(
      "smtp",
    );
    expect(
      getEmailSender({
        EMAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "k",
        EMAIL_FROM: "n@example.test",
      }).transport,
    ).toBe("resend");
  });
});

describe("SmtpSender", () => {
  it("sends through the transport with clean subject and headers", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "id1" });
    const result = await new SmtpSender({ sendMail }, "App <n@example.test>").send(message);
    expect(result).toEqual({ ok: true, id: "id1" });
    const arg = sendMail.mock.calls[0]![0];
    expect(arg.subject).toBe("Ciao Bcc: x@example.test");
    expect(arg.headers["List-Unsubscribe"]).toBe("<https://a.example.test/u> X: y");
    expect(arg.from).toBe("App <n@example.test>");
  });
  it("turns failures into a value-free retryable result", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("ECONNREFUSED secret-host"));
    const result = await new SmtpSender({ sendMail }, "n@example.test").send(message);
    expect(result).toEqual({ ok: false, error: "smtp_send_failed", retryable: true });
  });
});

describe("ResendSender", () => {
  const key = "re_secret_key_123";
  it("posts the payload with Idempotency-Key and no SDK", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 200 }));
    const result = await new ResendSender(key, "App <n@example.test>", doFetch).send(message);
    expect(result).toEqual({ ok: true, id: "r1" });
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe("batch-1");
    expect(init.headers.Authorization).toBe(`Bearer ${key}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: "App <n@example.test>",
      to: ["jessica@example.test"],
      text: "x",
    });
    expect(body.subject).toBe("Ciao Bcc: x@example.test");
  });
  it.each([
    [429, true],
    [500, true],
    [422, false],
    [401, false],
  ])("status %i -> retryable %s, never leaks the key", async (status, retryable) => {
    const doFetch = vi.fn().mockResolvedValue(new Response(`{"message":"${key}"}`, { status }));
    const result = await new ResendSender(key, "n@example.test", doFetch).send(message);
    expect(result).toEqual({ ok: false, error: `resend_http_${status}`, retryable });
    expect(JSON.stringify(result)).not.toContain(key);
  });
  it("network errors are retryable and value-free", async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error(`boom ${key}`));
    const result = await new ResendSender(key, "n@example.test", doFetch).send(message);
    expect(result).toEqual({ ok: false, error: "resend_network_error", retryable: true });
  });
});
