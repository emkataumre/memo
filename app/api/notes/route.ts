import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author, NoteColor } from "@/lib/types";

const VALID_COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];
const VALID_AUTHORS: Author[] = ["emo", "magi"];

export async function GET() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const author = body.author;
  const text = body.body;
  const color = body.color;
  const x = body.x;
  const y = body.y;
  const rotation = body.rotation;

  if (
    typeof author !== "string" ||
    !VALID_AUTHORS.includes(author as Author) ||
    typeof text !== "string" ||
    text.length === 0 ||
    text.length > 2000 ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const finalColor: NoteColor = VALID_COLORS.includes(color as NoteColor)
    ? (color as NoteColor)
    : "lemon";

  const finalRotation =
    typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      author,
      body: text,
      color: finalColor,
      x,
      y,
      rotation: finalRotation,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
