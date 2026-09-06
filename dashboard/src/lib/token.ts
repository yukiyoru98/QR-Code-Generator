import { randomBytes } from "node:crypto";

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateToken(length = 8): string {
  const bytes = randomBytes(length);
  let token = "";

  for (const value of bytes) {
    token += BASE62_ALPHABET[value % 62];
  }

  return token;
}
