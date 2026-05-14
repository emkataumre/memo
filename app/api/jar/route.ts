import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author, JarState } from "@/lib/types";

// GET /api/jar — returns the public jar shape: count and per-author
// breakdown. Idea bodies are intentionally NOT returned; they only
// surface via /api/jar/draw so users can't pick favourites.
export async function GET() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("date_ideas")
    .select("author")
    .eq("status", "in_jar");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const byAuthor: Record<Author, number> = { emo: 0, magi: 0 };
  for (const row of data ?? []) {
    if (row.author === "emo" || row.author === "magi") {
      byAuthor[row.author as Author]++;
    }
  }
  const state: JarState = { count: data?.length ?? 0, byAuthor };
  return NextResponse.json(state);
}
