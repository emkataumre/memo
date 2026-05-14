// Photo state helpers. The client owns reveal-time derivation now —
// the server no longer sends a `locked` flag (it would always be
// approximate due to clock skew between server and client anyway).

export function isLocked(
  photo: { reveal_at: string },
  now: number = Date.now(),
): boolean {
  return Date.parse(photo.reveal_at) > now;
}
