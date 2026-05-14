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
  const photoId = crypto.randomUUID();
  const day = memoDay();
  const fullPath = `${day}/${photoId}.jpg`;
  const thumbPath = `${day}/${photoId}_thumb.jpg`;

  const fullBuffer = await file.arrayBuffer();
  const thumbBuffer = await thumb.arrayBuffer();

  const { error: e1 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fullPath, fullBuffer, { contentType: "image/jpeg", upsert: false });
  if (e1)
    return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(thumbPath, thumbBuffer, {
      contentType: "image/jpeg",
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
