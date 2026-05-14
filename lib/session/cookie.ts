export const SESSION_COOKIE = "memo_session";

const PAYLOAD = "ok";

function getSecret(): string {
  const secret = process.env.MEMO_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "MEMO_SESSION_SECRET environment variable is required and must be at least 16 characters",
    );
  }
  return secret;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function makeSessionToken(): Promise<string> {
  return hmac(getSecret(), PAYLOAD);
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const expected = await makeSessionToken();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
