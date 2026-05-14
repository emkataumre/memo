// HS256 JWT minting via Web Crypto. Signed with SUPABASE_JWT_SECRET so the
// token is accepted by Supabase Postgres (PostgREST + Realtime).
//
// `role` must be one of the Supabase DB roles (anon / authenticated /
// service_role) because PostgREST issues `SET ROLE` on it — a non-existent
// role causes 401 from REST. The gate for our app is the custom
// `memo_role` claim, which RLS read policies check via
// `request.jwt.claims ->> 'memo_role' = 'memo_session'`. Standard
// `authenticated` JWTs minted by Supabase Auth don't carry this claim,
// so they don't match the policy.

const JWT_TTL_SECONDS = 60 * 60; // 1 hour
const MEMO_ROLE = "memo_session";

function getSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SUPABASE_JWT_SECRET environment variable is required (≥32 chars; copy from Supabase dashboard → Settings → API → JWT Secret)",
    );
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJsonSegment(obj: Record<string, unknown>): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}

export interface MintedJwt {
  token: string;
  expiresAt: number; // ms since epoch
}

export async function mintRealtimeJwt(): Promise<MintedJwt> {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + JWT_TTL_SECONDS;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: "memo",
    aud: "authenticated",
    role: "authenticated",
    memo_role: MEMO_ROLE,
    sub: "memo-shared",
    iat,
    exp,
  };

  const headerB64 = encodeJsonSegment(header);
  const payloadB64 = encodeJsonSegment(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

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
    new TextEncoder().encode(signingInput),
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(sig));

  return {
    token: `${signingInput}.${signatureB64}`,
    expiresAt: exp * 1000,
  };
}
