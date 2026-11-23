import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
export function seal(payload: unknown, key: string, aad: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString("base64");
}
export function open<T>(value: string, key: string, aad: string): T {
  const b = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      b.subarray(0, 12),
    );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}
export const otpDigest = (key: string, id: string, code: string) =>
  createHmac("sha256", Buffer.from(key, "hex"))
    .update(id + ":" + code)
    .digest("hex");
export function equalDigest(a: string, b: string) {
  const x = Buffer.from(a, "hex"),
    y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
