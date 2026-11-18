import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetMissingSecretWarningForTest,
  verifyDocusealSignature,
} from "@/lib/docuseal-webhook";

function signPayload(secret: string, timestamp: number, rawBody: string): string {
  const hex = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `${timestamp}.${hex}`;
}

describe("verifyDocusealSignature", () => {
  const secret = "test-webhook-secret-123";
  const nowMs = 1_700_000_000_000;
  const nowSec = Math.floor(nowMs / 1000);
  const rawBody = JSON.stringify({ event_type: "form.completed", data: { id: 1 } });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMissingSecretWarningForTest();
  });

  it("accepts a valid signature within 300 seconds", () => {
    const header = signPayload(secret, nowSec - 60, rawBody);
    const result = verifyDocusealSignature(rawBody, header, { secret, nowMs });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a signature signed with the wrong secret", () => {
    const header = signPayload("wrong-secret", nowSec, rawBody);
    const result = verifyDocusealSignature(rawBody, header, { secret, nowMs });
    expect(result.ok).toBe(false);
  });

  it("rejects a stale timestamp older than 300 seconds", () => {
    const header = signPayload(secret, nowSec - 301, rawBody);
    const result = verifyDocusealSignature(rawBody, header, { secret, nowMs });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const result = verifyDocusealSignature(rawBody, "", { secret, nowMs });
    expect(result.ok).toBe(false);
  });

  it("rejects a tampered body", () => {
    const header = signPayload(secret, nowSec, rawBody);
    const tamperedBody = JSON.stringify({ event_type: "form.completed", data: { id: 999 } });
    const result = verifyDocusealSignature(tamperedBody, header, { secret, nowMs });
    expect(result.ok).toBe(false);
  });

  it("rejects in production when secret is unset", () => {
    const result = verifyDocusealSignature(rawBody, "", {
      secret: "",
      nodeEnv: "production",
      nowMs,
    });
    expect(result.ok).toBe(false);
  });

  it("warns once and allows outside production when secret is unset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r1 = verifyDocusealSignature(rawBody, "", {
      secret: "",
      nodeEnv: "development",
      nowMs,
    });
    const r2 = verifyDocusealSignature(rawBody, "", {
      secret: "",
      nodeEnv: "development",
      nowMs,
    });
    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
