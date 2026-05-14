import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { NoteColor } from "@/lib/types";

const VALID_COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.body === "string" && body.body.length <= 2000)
    patch.body = body.body;
  if (typeof body.color === "string" && VALID_COLORS.includes(body.color as NoteColor))
    patch.color = body.color;
  if (typeof body.x === "number" && Number.isFinite(body.x)) patch.x = body.x;
  if (typeof body.y === "number" && Number.isFinite(body.y)) patch.y = body.y;
  if (typeof body.rotation === "number" && Number.isFinite(body.rotation))
    patch.rotation = body.rotation;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("notes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

