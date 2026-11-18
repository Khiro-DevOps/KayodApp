import crypto from "crypto";

let warnedMissingSecret = false;

export type VerifyDocusealSignatureResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verifies the DocuSeal webhook signature header (`<timestamp>.<hexsignature>`)
 * against `DOCUSEAL_WEBHOOK_SECRET` using HMAC-SHA256 and `crypto.timingSafeEqual`.
 */
export function verifyDocusealSignature(
  rawBody: string,
  signatureHeader: string,
  options?: { nowMs?: number; secret?: string; nodeEnv?: string },
): VerifyDocusealSignatureResult {
  const secret = (options?.secret ?? process.env.DOCUSEAL_WEBHOOK_SECRET)?.trim();
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;

  if (!secret) {
    if (nodeEnv === "production") {
      return { ok: false, error: "Webhook secret is not configured" };
    }
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        "[DocuSeal Webhook] DOCUSEAL_WEBHOOK_SECRET is not set; allowing unverified webhook in non-production",
      );
    }
    return { ok: true };
  }

  if (!signatureHeader) {
    return { ok: false, error: "Missing signature" };
  }

  const dotIdx = signatureHeader.indexOf(".");
  if (dotIdx <= 0) {
    return { ok: false, error: "Invalid signature format" };
  }

  const timestampStr = signatureHeader.slice(0, dotIdx).trim();
  const receivedHex = signatureHeader.slice(dotIdx + 1).trim();

  if (!timestampStr || !receivedHex) {
    return { ok: false, error: "Invalid signature format" };
  }

  const timestampSec = Number(timestampStr);
  if (!Number.isFinite(timestampSec)) {
    return { ok: false, error: "Invalid signature timestamp" };
  }

  const nowSec = Math.floor((options?.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - timestampSec) > 300) {
    return { ok: false, error: "Stale webhook timestamp" };
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(`${timestampStr}.${rawBody}`)
    .digest("hex");

  if (receivedHex.length !== expectedHex.length) {
    return { ok: false, error: "Invalid signature" };
  }

  try {
    const expectedBuf = Buffer.from(expectedHex, "hex");
    const receivedBuf = Buffer.from(receivedHex, "hex");

    if (expectedBuf.length === 0 || expectedBuf.length !== receivedBuf.length) {
      return { ok: false, error: "Invalid signature" };
    }

    if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      return { ok: false, error: "Invalid signature" };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid signature" };
  }
}

export function resetMissingSecretWarningForTest() {
  warnedMissingSecret = false;
}
