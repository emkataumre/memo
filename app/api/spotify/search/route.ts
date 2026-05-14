import { NextResponse } from "next/server";
import { searchTracks } from "@/lib/spotify/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchTracks(q);
    return NextResponse.json({ tracks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search failed" },
      { status: 500 },
    );
  }
}
