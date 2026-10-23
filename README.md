# ytnblm

Add every video in a YouTube playlist as a source in a (consumer) NotebookLM notebook.

NotebookLM has no consumer API and no playlist import, so this lists the playlist with
`yt-dlp` and drives notebook.google.com with Playwright in a persistent Chrome profile.

## Requirements

- [Bun](https://bun.com), Google Chrome, and a recent `yt-dlp` (old versions silently return
  0 playlist entries; `brew upgrade yt-dlp`).
- `bun install`

## Usage

```bash
bun index.ts login                              # once: sign in to Google in the opened Chrome
bun index.ts add "https://www.youtube.com/playlist?list=..."
```

Options for `add`:

| Option | Default | Meaning |
| --- | --- | --- |
| `--notebook <id\|url>` | remembered notebook(s), else a new one | Target notebook |
| `--max-sources <n>` | 300 | Per-notebook source limit; overflow goes to `<playlist> (2)`, … (set 50 on the free plan) |
| `--headed` | off | Show the browser |

Behaviour:

- New playlists get a new notebook named after the playlist. The playlist → notebook mapping is
  stored in `~/.ytnblm/state.json`, so re-running only adds videos that are not yet sources.
- Videos are matched by YouTube video id, read from the notebook's own data, never by title
  (YouTube A/B-tests and changes titles).
- URLs are inserted 10 at a time; each batch is confirmed by reloading the notebook.
- The run ends by re-reading every notebook and checking each playlist video is a source exactly
  once. Exit code 1 if any are missing; re-run to retry them.
- Private/deleted playlist entries are skipped. NotebookLM only imports public videos with
  transcripts.

Environment: `YTNBLM_PROFILE` (Chrome profile dir, default `~/.ytnblm/chrome-profile`),
`YTNBLM_STATE` (state file).

## Fragility

This automates NotebookLM's web UI, so it breaks when Google changes the page. Selectors
live in `src/notebooklm.ts` (button names, `input.title-input`, and the `rLM1Ne` RPC that
lists a notebook's sources).
