import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/jar/cancel — body { id }.
// Flips a pending date back to `in_jar`. Idempotent only for the same id —
// rejects if the row is in any other state (no need to ever revert a
// completed date).
export async function POST(req: Request) {
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("date_ideas")
    .update({ status: "in_jar" })
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
