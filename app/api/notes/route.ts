import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Author, NoteColor, NoteVariant } from "@/lib/types";

const VALID_COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];
const VALID_AUTHORS: Author[] = ["emo", "magi"];
const VALID_VARIANTS: NoteVariant[] = [
  "classic",
  "strip",
  "grain",
  "tape",
  "quote",
];

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

  // Optional explicit size (drained from outbox after offline resize).
  const widthIn = body.width;
  const heightIn = body.height;
  const finalWidth =
    typeof widthIn === "number" && Number.isFinite(widthIn)
      ? Math.round(Math.max(208, Math.min(480, widthIn)))
      : null;
  const finalHeight =
    typeof heightIn === "number" && Number.isFinite(heightIn)
      ? Math.round(Math.max(128, Math.min(480, heightIn)))
      : null;

  const variantIn = body.variant;
  const finalVariant: NoteVariant =
    typeof variantIn === "string" &&
    VALID_VARIANTS.includes(variantIn as NoteVariant)
      ? (variantIn as NoteVariant)
      : "classic";

  const insertPayload: Record<string, unknown> = {
    author,
    body: text,
    color: finalColor,
    x,
    y,
    rotation: finalRotation,
    variant: finalVariant,
  };
  if (finalWidth !== null) insertPayload.width = finalWidth;
  if (finalHeight !== null) insertPayload.height = finalHeight;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("notes")
    .insert(insertPayload)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
