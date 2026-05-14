import "server-only";
import webpush, { type PushSubscription } from "web-push";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author } from "@/lib/types";

// VAPID setup is one-shot. The library memoizes details; subsequent
// setVapidDetails calls just overwrite. Calling this before every send
// is cheap and avoids relying on module-import order.
function configureVapid(): void {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY env vars are required for Web Push",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export interface SubscriptionRow {
  id: string;
  author: Author;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendResult {
  sent: number;
  pruned: number;
  failed: number;
}

// Send a payload to every stored subscription. Subscriptions that come
// back 404/410 are pruned (the browser has revoked them — sending again
// will keep failing). Other failures are logged but kept; transient
// upstream blips shouldn't drop the user.
export async function broadcast(payload: PushPayload): Promise<SendResult> {
  configureVapid();
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("id, author, endpoint, p256dh, auth");
  if (error) throw error;
  const rows = (data ?? []) as SubscriptionRow[];

  const json = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;
  let failed = 0;

  const pruneIds: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, json);
        sent += 1;
      } catch (err) {
        const status =
          typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        if (status === 404 || status === 410) {
          pruneIds.push(row.id);
          pruned += 1;
        } else {
          failed += 1;
          console.error("push send failed", {
            endpoint: row.endpoint,
            status,
            err,
          });
        }
      }
    }),
  );

  if (pruneIds.length > 0) {
    await sb.from("push_subscriptions").delete().in("id", pruneIds);
  }

  return { sent, pruned, failed };
}

// Upsert a single subscription. Re-subscribing from the same browser
// returns the same endpoint, so unique-on-endpoint dedups cleanly.
export async function saveSubscription(args: {
  author: Author;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  const sb = getSupabaseServer();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      author: args.author,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      user_agent: args.userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}
