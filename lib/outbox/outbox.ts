"use client";

// Mutation outbox. Queues HTTP mutations that fail (offline or 5xx) in
// IndexedDB and replays them when the network returns. Stays inside the
// app — no native Background Sync API because that's still missing on
// iOS Safari, which is our primary platform.
//
// Lives in its own IDB database ("memo-outbox") so the cache schema in
// lib/cache/indexeddb.ts doesn't need a version bump for outbox changes.

export type OutboxTag =
  | "note:create"
  | "note:move"
  | "jar:add"
  | "song:move"
  | "photo:move"
  | "photo:pin"
  | "photo:unpin";

export interface OutboxRequest {
  tag: OutboxTag;
  method: "POST" | "PATCH";
  path: string;
  body?: unknown;
  // Free-form correlation data the consumer attaches (temp ids, etc).
  meta?: Record<string, unknown>;
}

export interface OutboxItem extends OutboxRequest {
  id: number;
  createdAt: number;
  attempts: number;
}

export type DrainStatus = "ok" | "client_error" | "server_error" | "offline";

export interface DrainResult {
  item: OutboxItem;
  status: DrainStatus;
  response: unknown;
  error?: string;
}

type Listener = (state: { count: number }) => void;

const DB_NAME = "memo-outbox";
const DB_VERSION = 1;
const STORE = "requests";
const MAX_ATTEMPTS = 10;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB not available"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const listeners = new Set<Listener>();

async function emit(): Promise<void> {
  let count = 0;
  try {
    count = await outboxCount();
  } catch {
    /* opening DB can fail in SSR — ignore */
  }
  for (const fn of listeners) fn({ count });
}

export async function enqueue(req: OutboxRequest): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const payload: Omit<OutboxItem, "id"> = {
      ...req,
      createdAt: Date.now(),
      attempts: 0,
    };
    const r = store.add(payload);
    r.onsuccess = () => {
      resolve(r.result as number);
      void emit();
    };
    r.onerror = () => reject(r.error);
  });
}

export async function outboxCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const r = store.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function allItems(): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as OutboxItem[]);
    r.onerror = () => reject(r.error);
  });
}

async function removeItem(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const r = tx.objectStore(STORE).delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function updateItem(item: OutboxItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const r = tx.objectStore(STORE).put(item);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// Cursor-walk every queued item, replacing matches in place. Used when
// a follow-up mutation should be folded into a still-queued earlier one
// — e.g. moving a temp note before its create has drained.
export async function updateQueuedItems(
  predicate: (item: OutboxItem) => boolean,
  mutator: (item: OutboxItem) => OutboxItem,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve();
        return;
      }
      const item = cursor.value as OutboxItem;
      if (predicate(item)) cursor.update(mutator(item));
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  void emit();
}

let draining = false;

export async function drain(
  onResult?: (result: DrainResult) => void,
): Promise<DrainResult[]> {
  if (draining) return [];
  draining = true;
  const results: DrainResult[] = [];
  try {
    const items = (await allItems()).sort((a, b) => a.id - b.id);
    for (const item of items) {
      let result: DrainResult;
      try {
        const res = await fetch(item.path, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: item.body === undefined ? undefined : JSON.stringify(item.body),
        });
        let responseBody: unknown = null;
        try {
          responseBody = await res.json();
        } catch {
          /* non-JSON or empty body */
        }
        if (res.ok) {
          result = { item, status: "ok", response: responseBody };
          await removeItem(item.id);
        } else if (res.status >= 400 && res.status < 500) {
          // Server rejected the payload. Retrying won't help — drop it.
          result = {
            item,
            status: "client_error",
            response: responseBody,
            error: `status ${res.status}`,
          };
          await removeItem(item.id);
        } else {
          const next: OutboxItem = { ...item, attempts: item.attempts + 1 };
          if (next.attempts >= MAX_ATTEMPTS) {
            await removeItem(item.id);
          } else {
            await updateItem(next);
          }
          result = {
            item: next,
            status: "server_error",
            response: responseBody,
            error: `status ${res.status}`,
          };
        }
      } catch (err) {
        result = {
          item,
          status: "offline",
          response: null,
          error: err instanceof Error ? err.message : "network error",
        };
      }
      results.push(result);
      onResult?.(result);
      void emit();
      // If we hit a connectivity wall, stop draining — leave the rest
      // queued for the next online event.
      if (result.status === "offline") break;
    }
  } finally {
    draining = false;
  }
  return results;
}

export function subscribeOutbox(fn: Listener): () => void {
  listeners.add(fn);
  // Snapshot the current count for the new subscriber.
  void outboxCount()
    .then((count) => fn({ count }))
    .catch(() => fn({ count: 0 }));
  return () => {
    listeners.delete(fn);
  };
}
