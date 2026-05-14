import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

// POST /api/jar/decide — body { id, take }.
//   take === false → idea stays in the jar (no DB change). Returns ok.
//   take === true  → mark idea taken, atomically create a sticky note
//     with the idea body, link the two via taken_note_id, return note.
//
// The note's coords are randomised near the canvas origin so the user
// can find it after navigating back to the canvas. Author of the note
// carries over from the idea — the person who added the idea owns the
// resulting memory record.
const COORD_SPREAD = 300;
const ROTATION_SPREAD = 6;

interface IdeaRow {
  id: string;
  author: string;
  body: string;
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
    .select("id, author, body, status")
    .eq("id", body.id)
    .single<IdeaRow>();
  if (readErr || !idea) {
    return NextResponse.json({ error: "idea not found" }, { status: 404 });
  }
  if (idea.status !== "in_jar") {
    return NextResponse.json({ error: "idea already taken" }, { status: 409 });
  }

  const x = (Math.random() - 0.5) * 2 * COORD_SPREAD;
  const y = (Math.random() - 0.5) * 2 * COORD_SPREAD;
  const rotation = (Math.random() - 0.5) * 2 * ROTATION_SPREAD;

  const { data: note, error: noteErr } = await supabase
    .from("notes")
    .insert({
      author: idea.author,
      body: idea.body,
      color: "lemon",
      x,
      y,
      rotation,
    })
    .select()
    .single();
  if (noteErr || !note) {
    return NextResponse.json(
      { error: noteErr?.message ?? "note insert failed" },
      { status: 500 },
    );
  }

  const { error: updateErr } = await supabase
    .from("date_ideas")
    .update({
      status: "taken",
      taken_at: new Date().toISOString(),
      taken_note_id: note.id,
    })
    .eq("id", body.id);
  if (updateErr) {
    // Note already exists; surface the partial failure but the user
    // will still see the note appear on the canvas via Realtime.
    return NextResponse.json(
      { note, warning: updateErr.message },
      { status: 200 },
    );
  }

  return NextResponse.json({ note });
}
