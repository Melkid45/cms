import { createHash, createPublicKey, verify } from "node:crypto";
export function botMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array,
) {
  return `${timestamp}\n${nonce}\n${method}\n${path}\n${createHash("sha256").update(body).digest("hex")}`;
}
export function validBotSignature(
  input: {
    method: string;
    path: string;
    timestamp: string;
    nonce: string;
    body: Uint8Array;
    signature: string;
    publicKey: string;
  },
  now = Date.now(),
) {
  try {
    if (
      !/^\d{13}$/.test(input.timestamp) ||
      Math.abs(now - Number(input.timestamp)) > 60000 ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(input.nonce) ||
      input.signature.length > 150
    )
      return false;
    const publicKey = createPublicKey({
      key: Buffer.from(input.publicKey, "base64"),
      type: "spki",
      format: "der",
    });
    return verify(
      null,
      Buffer.from(
        botMessage(
          input.method,
          input.path,
          input.timestamp,
          input.nonce,
          input.body,
        ),
      ),
      publicKey,
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}
