import { homedir } from "node:os";
import { join } from "node:path";

/** Remembers which notebook(s) a playlist was synced into so re-runs reuse them. */
const STATE_FILE = process.env.YTNBLM_STATE ?? join(homedir(), ".ytnblm", "state.json");

type State = { playlists: Record<string, string[]> };

async function load(): Promise<State> {
  const file = Bun.file(STATE_FILE);
  return (await file.exists()) ? await file.json() : { playlists: {} };
}

export async function notebooksFor(playlistId: string): Promise<string[]> {
  return (await load()).playlists[playlistId] ?? [];
}

export async function recordNotebook(playlistId: string, notebookId: string): Promise<void> {
  const state = await load();
  const ids = state.playlists[playlistId] ?? [];
  if (!ids.includes(notebookId)) state.playlists[playlistId] = [...ids, notebookId];
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}
