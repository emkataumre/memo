import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author, DateIdea, JarState } from "@/lib/types";

// GET /api/jar — public jar shape: in-jar count + per-author breakdown +
// the single pending date entity (if any). Idea bodies sitting in the
// jar are NOT returned — they only surface via /api/jar/draw.
export async function GET() {
  const supabase = getSupabaseServer();
  const [{ data: inJar, error: e1 }, { data: pending, error: e2 }] =
    await Promise.all([
      supabase.from("date_ideas").select("author").eq("status", "in_jar"),
      supabase
        .from("date_ideas")
        .select("*")
        .eq("status", "pending")
        .limit(1)
        .maybeSingle(),
    ]);
  if (e1) {
    return NextResponse.json({ error: e1.message }, { status: 500 });
  }
  if (e2) {
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  const byAuthor: Record<Author, number> = { emo: 0, magi: 0 };
  for (const row of inJar ?? []) {
    if (row.author === "emo" || row.author === "magi") {
      byAuthor[row.author as Author]++;
    }
  }
  const state: JarState = {
    count: inJar?.length ?? 0,
    byAuthor,
    pending: (pending ?? null) as DateIdea | null,
  };
  return NextResponse.json(state);
}
