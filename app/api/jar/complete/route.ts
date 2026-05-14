import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/jar/complete — body { id, caption? }.
// Flips the pending date to `completed`, stamping `event_at` and
// `completed_at` to now. Photos attached to the date (via
// /api/photos/upload with dateIdeaId) can be uploaded before or after
// this call; the FK on photos.date_idea_id is what binds them in the
// archive. We don't require a photo at completion time — caption-only
// dates are valid.
export async function POST(req: Request) {
  let body: { id?: unknown; caption?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; caption?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const caption =
    typeof body.caption === "string" && body.caption.length > 0
      ? body.caption.slice(0, 500)
      : null;

  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("date_ideas")
    .update({
      status: "completed",
      event_at: now,
      completed_at: now,
      caption,
    })
    .eq("id", body.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "no pending date with that id" },
      { status: 404 },
    );
  }
  return NextResponse.json({ idea: data });
}
