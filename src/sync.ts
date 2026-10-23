import type { Page } from "playwright";
import { openContext } from "./browser";
import { fetchPlaylist, type Video } from "./playlist";
import {
  addUrls,
  createNotebook,
  openNotebook,
  renameNotebook,
  waitForVideos,
} from "./notebooklm";
import { notebooksFor, recordNotebook } from "./state";

export interface SyncOptions {
  playlistUrl: string;
  /** Target notebook id; default: notebooks remembered for this playlist, else a new one. */
  notebookId?: string;
  maxSources: number;
  headed: boolean;
}

/** URLs pasted per "Insert"; keeps one bad URL from stalling a large batch. */
const BATCH_SIZE = 10;
const INGEST_TIMEOUT_MS = 3 * 60_000;

/** Returns true when every available playlist video ends up as a source. */
export async function sync(opts: SyncOptions): Promise<boolean> {
  const playlist = await fetchPlaylist(opts.playlistUrl);
  console.log(`Playlist "${playlist.title}": ${playlist.videos.length} videos`);
  for (const s of playlist.skipped) console.log(`  skip ${s.id}: ${s.reason}`);

  const notebookIds = opts.notebookId ? [opts.notebookId] : await notebooksFor(playlist.id);
  const ctx = await openContext(!opts.headed);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    const present = new Set<string>();
    let current: { id: string; count: number } | undefined;
    for (const id of notebookIds) {
      const videoIds = await openNotebook(page, id);
      for (const v of videoIds) present.add(v);
      // Counts YouTube sources only; other source types in a reused notebook aren't seen.
      current = { id, count: videoIds.length };
      await recordNotebook(playlist.id, id);
    }

    const pending = playlist.videos.filter((v) => !present.has(v.id));
    console.log(`${playlist.videos.length - pending.length} already present, ${pending.length} to add`);

    let notebookIndex = notebookIds.length;
    while (pending.length > 0) {
      if (!current || current.count >= opts.maxSources) {
        notebookIndex++;
        const title = notebookIndex === 1 ? playlist.title : `${playlist.title} (${notebookIndex})`;
        const id = await createNotebook(page);
        await recordNotebook(playlist.id, id);
        await renameNotebook(page, title);
        console.log(`Created notebook "${title}" ${page.url()}`);
        current = { id, count: 0 };
      } else if (!page.url().includes(current.id)) {
        await openNotebook(page, current.id);
      }

      const batch = pending.splice(0, Math.min(BATCH_SIZE, opts.maxSources - current.count));
      await addUrls(page, batch.map((v) => v.url));
      const missing = new Set(await waitForVideos(page, current.id, batch.map((v) => v.id), INGEST_TIMEOUT_MS));
      for (const v of batch) console.log(`  ${missing.has(v.id) ? "FAIL" : "ok  "} ${v.id} ${v.title}`);
      current.count += batch.length - missing.size;
    }

    return await verify(page, playlist.id, playlist.videos);
  } finally {
    await ctx.close();
  }
}

/** Re-reads every notebook from scratch: each playlist video must be a source exactly once. */
async function verify(page: Page, playlistId: string, videos: Video[]): Promise<boolean> {
  const occurrences = new Map<string, number>();
  for (const id of await notebooksFor(playlistId)) {
    const videoIds = await openNotebook(page, id);
    for (const v of videoIds) occurrences.set(v, (occurrences.get(v) ?? 0) + 1);
    console.log(`Notebook ${page.url()}: ${videoIds.length} YouTube sources`);
  }
  const missing = videos.filter((v) => !occurrences.has(v.id));
  const duplicated = videos.filter((v) => (occurrences.get(v.id) ?? 0) > 1);
  for (const v of missing) console.log(`  missing    ${v.url}  ${v.title}`);
  for (const v of duplicated) console.log(`  duplicated ${v.url} x${occurrences.get(v.id)}  ${v.title}`);
  if (missing.length === 0 && duplicated.length === 0) {
    console.log(`Verified: all ${videos.length} playlist videos are sources, once each.`);
    return true;
  }
  if (missing.length) console.log(`Missing ${missing.length}/${videos.length}; re-run to retry.`);
  return missing.length === 0;
}
