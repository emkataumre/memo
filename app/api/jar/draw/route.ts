import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/jar/draw — returns one random in-jar idea (or null if empty).
// Read-only: the idea remains in the jar until /api/jar/decide is called
// with { take: true }. Body may include `excludeIds` so "draw again" can
// avoid re-handing the same slip back.
export async function POST(req: Request) {
  let body: { excludeIds?: unknown };
  try {
    body = (await req.json().catch(() => ({}))) as { excludeIds?: unknown };
  } catch {
    body = {};
  }

  const excludeIds = Array.isArray(body.excludeIds)
    ? body.excludeIds.filter((v): v is string => typeof v === "string")
    : [];

  const supabase = getSupabaseServer();

  // Fetch all candidate ids first; doing `order by random()` server-side
  // requires a DB function and the jar will never be huge (2 users).
  const query = supabase.from("date_ideas").select("*").eq("status", "in_jar");
  if (excludeIds.length > 0) {
    // Filter out excluded ids unless they're the only ones left.
    const candidates = await query;
    if (candidates.error) {
      return NextResponse.json({ error: candidates.error.message }, { status: 500 });
    }
    const pool = (candidates.data ?? []).filter(
      (r: { id: string }) => !excludeIds.includes(r.id),
    );
    const fallback = pool.length > 0 ? pool : (candidates.data ?? []);
    if (fallback.length === 0) {
      return NextResponse.json({ idea: null });
    }
    const picked = fallback[Math.floor(Math.random() * fallback.length)];
    return NextResponse.json({ idea: picked });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ idea: null });
  }
  const picked = data[Math.floor(Math.random() * data.length)];
  return NextResponse.json({ idea: picked });
}
