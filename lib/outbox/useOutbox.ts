"use client";

import { useEffect, useState } from "react";
import { subscribeOutbox } from "./outbox";

// Returns the current pending mutation count. Updates whenever items
// are enqueued or drained.
export function useOutboxCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeOutbox((s) => setCount(s.count)), []);
  return count;
}
