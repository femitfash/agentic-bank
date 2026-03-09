import crypto from "crypto";

// VULN: Weak Cryptography — MD5 hashing, no salt, predictable tokens

// VULNERABLE: Using MD5 for password hashing (fast, collision-prone, no salt)
export function hashPassword(password: string): string {
  return crypto.createHash("md5").update(password).digest("hex");
}

// VULNERABLE: Verifying passwords with timing-vulnerable comparison
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// VULNERABLE: Predictable token generation using timestamp
export function generateToken(userId: string): string {
  const timestamp = Date.now().toString();
  return crypto.createHash("md5").update(userId + timestamp).digest("hex");
}

// VULNERABLE: Weak encryption using DES (deprecated, short key)
export function encryptData(data: string, key: string): string {
  const cipher = crypto.createCipheriv("des-ecb", key.slice(0, 8), null);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

// VULNERABLE: Using Math.random() for security-sensitive operations
export function generateResetCode(): string {
  return Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
}

// VULNERABLE: Base64 "encryption" (encoding, not encryption)
export function obfuscateSecret(secret: string): string {
  return Buffer.from(secret).toString("base64");
}
