import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * PATCH /api/photos/[id]
 * Body accepts any combination of:
 *   { pin: true,  pinned_x: number, pinned_y: number, pinned_rotation?: number }
 *   { pin: false } — unpin (clears coords + pinned_at)
 *   { pinned_x: number, pinned_y: number, pinned_rotation?: number } — move
 *   { caption: string }
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
    // Coords are optional on re-pin: if the row already has prior coords
    // we keep them so the card returns to its last known spot. Caller
    // can override by passing pinned_x/pinned_y explicitly.
    if (typeof body.pinned_x === "number") patch.pinned_x = body.pinned_x;
    if (typeof body.pinned_y === "number") patch.pinned_y = body.pinned_y;
    if (typeof body.pinned_rotation === "number")
      patch.pinned_rotation = body.pinned_rotation;
    patch.pinned_at = new Date().toISOString();
  } else if (body.pin === false) {
    // Preserve coords so a re-pin restores position. Only clear pinned_at.
    patch.pinned_at = null;
  } else {
    if (typeof body.pinned_x === "number") patch.pinned_x = body.pinned_x;
    if (typeof body.pinned_y === "number") patch.pinned_y = body.pinned_y;
    if (typeof body.pinned_rotation === "number")
      patch.pinned_rotation = body.pinned_rotation;
  }

  if (typeof body.caption === "string" && body.caption.length <= 500) {
    patch.caption = body.caption;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("photos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photo: data });
}
