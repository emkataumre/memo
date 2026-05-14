import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * PATCH /api/songs/[id]
 * Body:
 *   { pin: true, pinned_x: number, pinned_y: number, pinned_rotation?: number }
 *   { pin: false } — unpin
 *   { pinned_x: number, pinned_y: number, pinned_rotation?: number } — move
 */
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

  const patch: Record<string, unknown> = {};

  if (body.pin === true) {
    if (typeof body.pinned_x !== "number" || typeof body.pinned_y !== "number") {
      return NextResponse.json(
        { error: "pinned_x and pinned_y required when pinning" },
        { status: 400 },
      );
    }
    patch.pinned_x = body.pinned_x;
    patch.pinned_y = body.pinned_y;
    patch.pinned_rotation =
      typeof body.pinned_rotation === "number" ? body.pinned_rotation : 0;
    patch.pinned_at = new Date().toISOString();
  } else if (body.pin === false) {
    patch.pinned_x = null;
    patch.pinned_y = null;
    patch.pinned_rotation = 0;
    patch.pinned_at = null;
  } else {
    if (typeof body.pinned_x === "number") patch.pinned_x = body.pinned_x;
    if (typeof body.pinned_y === "number") patch.pinned_y = body.pinned_y;
    if (typeof body.pinned_rotation === "number")
      patch.pinned_rotation = body.pinned_rotation;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("songs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ song: data });
}
