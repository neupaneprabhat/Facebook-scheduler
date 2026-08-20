import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const AUTH_SECRET =
  process.env.TOKEN_ENCRYPTION_KEY || "fb_scheduler_secure_auth_session_secret_key_2026";
export const AUTH_COOKIE_NAME = "fb_scheduler_session";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  exp: number;
}

/**
 * Hashes a plain-text password using native crypto.scrypt
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/**
 * Verifies a plain-text password against a stored hash and salt
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

/**
 * Creates a cryptographically signed session token (valid for 7 days)
 */
export function createSessionToken(user: { id: string; email: string; name: string; role?: string }): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "ADMIN",
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validates and decodes a signed session token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payloadB64)
    .digest("base64url");

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "utf-8"),
      Buffer.from(expectedSig, "utf-8")
    );
    if (!isValid) return null;

    const payload: SessionPayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8")
    );

    if (Date.now() > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Gets the current authenticated user from Next.js cookies (server-side)
 */
export async function getCurrentUser() {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const session = verifySessionToken(token);
    if (!session) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return user;
  } catch {
    return null;
  }
}
