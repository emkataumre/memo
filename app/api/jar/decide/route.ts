import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/jar/decide — body { id, take }.
//   take === false → idea stays in the jar (no DB change).
//   take === true  → idea flips to `pending`. Rejects with 409 if another
//                    pending date already exists (one-at-a-time rule).
//
// The old behaviour (auto-create a sticky note on the canvas) was retired
// in the dates rework — see migration 0007. Completion happens later via
// /api/jar/complete.

interface IdeaRow {
  id: string;
  status: string;
}

export async function POST(req: Request) {
  let body: { id?: unknown; take?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; take?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.take !== "boolean") {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  if (!body.take) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseServer();

  const { data: idea, error: readErr } = await supabase
    .from("date_ideas")
    .select("id, status")
    .eq("id", body.id)
    .single<IdeaRow>();
  if (readErr || !idea) {
    return NextResponse.json({ error: "idea not found" }, { status: 404 });
  }
  if (idea.status !== "in_jar") {
    return NextResponse.json(
      { error: "idea is not in the jar" },
      { status: 409 },
    );
  }

  // Cheap precheck before relying on the unique partial index. Gives a
  // friendlier error than a raw constraint violation.
  const { data: existingPending } = await supabase
    .from("date_ideas")
    .select("id")
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existingPending) {
    return NextResponse.json(
      { error: "another date is already pending — finish or cancel it first" },
      { status: 409 },
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("date_ideas")
    .update({ status: "pending" })
    .eq("id", body.id)
    .eq("status", "in_jar")
    .select()
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "failed to update" },
      { status: 500 },
    );
  }

  return NextResponse.json({ pending: updated });
}
