export interface Video {
  id: string;
  title: string;
  url: string;
}

export interface Playlist {
  id: string;
  title: string;
  videos: Video[];
  /** Entries yt-dlp listed but that cannot be added (private/deleted). */
  skipped: { id: string; reason: string }[];
}

const UNAVAILABLE_TITLES: Record<string, true> = {
  "[Private video]": true,
  "[Deleted video]": true,
};

export async function fetchPlaylist(url: string): Promise<Playlist> {
  const proc = Bun.spawn(["yt-dlp", "--flat-playlist", "-J", "--no-warnings", url], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`yt-dlp failed (${code}): ${err.trim()}`);

  const json = JSON.parse(out);
  if (json._type !== "playlist") throw new Error(`Not a playlist URL: ${url}`);
  const entries: { id: string; title?: string; availability?: string | null }[] =
    json.entries ?? [];
  if (json.playlist_count && entries.length < json.playlist_count) {
    // yt-dlp silently drops entries when YouTube's page format outruns it.
    throw new Error(
      `yt-dlp returned ${entries.length}/${json.playlist_count} entries; run \`yt-dlp -U\` (or brew upgrade yt-dlp).`,
    );
  }

  const videos: Video[] = [];
  const skipped: Playlist["skipped"] = [];
  for (const e of entries) {
    const title = e.title ?? e.id;
    if (UNAVAILABLE_TITLES[title] || e.availability === "private") {
      skipped.push({ id: e.id, reason: title });
      continue;
    }
    videos.push({ id: e.id, title, url: `https://www.youtube.com/watch?v=${e.id}` });
  }
  return { id: json.id, title: json.title, videos, skipped };
}
