import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { memoDay } from "@/lib/memo-day";
import type { Author } from "@/lib/types";

const VALID_AUTHORS: Author[] = ["emo", "magi"];
const STORAGE_BUCKET = "photos";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  const thumb = form.get("thumb");
  const author = form.get("author");
  const caption = form.get("caption");
  const dateIdeaId = form.get("dateIdeaId");

  if (!(file instanceof Blob) || !(thumb instanceof Blob)) {
    return NextResponse.json(
      { error: "file and thumb required" },
      { status: 400 },
    );
  }
  if (typeof author !== "string" || !VALID_AUTHORS.includes(author as Author)) {
    return NextResponse.json({ error: "invalid author" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "file too large" }, { status: 413 });
  }

  const supabase = getSupabaseServer();

  // Validate the date binding up-front so we don't waste a Storage
  // upload on a stale/cancelled idea. We accept ideas in either pending
  // or completed state — the photo might be uploaded a beat after the
  // completion call, especially if the user wrote a caption first.
  let validatedDateIdeaId: string | null = null;
  if (typeof dateIdeaId === "string" && dateIdeaId.length > 0) {
    const { data: idea, error: ideaErr } = await supabase
      .from("date_ideas")
      .select("id, status")
      .eq("id", dateIdeaId)
      .maybeSingle();
    if (ideaErr) {
      return NextResponse.json({ error: ideaErr.message }, { status: 500 });
    }
    if (!idea) {
      return NextResponse.json({ error: "date idea not found" }, { status: 404 });
    }
    if (idea.status !== "pending" && idea.status !== "completed") {
      return NextResponse.json(
        { error: "date idea is not in an attachable state" },
        { status: 409 },
      );
    }
    validatedDateIdeaId = idea.id as string;
  }

  const photoId = crypto.randomUUID();
  const day = memoDay();
  // Date-bound photos go under a `dates/` prefix so the archive directory
  // tree is self-explanatory in the Storage browser. Daily photos keep
  // the per-memo-day layout.
  const dir = validatedDateIdeaId ? `dates/${validatedDateIdeaId}` : day;
  const fullPath = `${dir}/${photoId}.webp`;
  const thumbPath = `${dir}/${photoId}_thumb.webp`;

  const fullBuffer = await file.arrayBuffer();
  const thumbBuffer = await thumb.arrayBuffer();

  const { error: e1 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fullPath, fullBuffer, { contentType: "image/webp", upsert: false });
  if (e1)
    return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(thumbPath, thumbBuffer, {
      contentType: "image/webp",
      upsert: false,
    });
  if (e2) {
    await supabase.storage.from(STORAGE_BUCKET).remove([fullPath]);
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }

  const insertPayload: Record<string, unknown> = {
    id: photoId,
    author,
    storage_path: fullPath,
  };
  if (typeof caption === "string" && caption.length > 0 && caption.length <= 500) {
    insertPayload.caption = caption;
  }
  if (validatedDateIdeaId) {
    insertPayload.date_idea_id = validatedDateIdeaId;
    // The reveal trigger detects date_idea_id and stamps reveal_at = now()
    // when omitted; setting it here too is belt-and-braces.
    insertPayload.reveal_at = new Date().toISOString();
  }

  const { data, error: e3 } = await supabase
    .from("photos")
    .insert(insertPayload)
    .select()
    .single();

  if (e3) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([fullPath, thumbPath]);
    return NextResponse.json({ error: e3.message }, { status: 500 });
  }

  return NextResponse.json({ photo: data });
}
