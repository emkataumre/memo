import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author } from "@/lib/types";

const VALID_AUTHORS: Author[] = ["emo", "magi"];
const MAX_BODY_LEN = 500;

export async function POST(req: Request) {
  let body: { author?: unknown; body?: unknown };
  try {
    body = (await req.json()) as { author?: unknown; body?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (
    typeof body.author !== "string" ||
    !VALID_AUTHORS.includes(body.author as Author)
  ) {
    return NextResponse.json({ error: "invalid author" }, { status: 400 });
  }
  if (
    typeof body.body !== "string" ||
    body.body.trim().length === 0 ||
    body.body.length > MAX_BODY_LEN
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("date_ideas")
    .insert({ author: body.author, body: body.body.trim() })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ idea: data });
}
