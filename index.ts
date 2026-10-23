#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { login } from "./src/login";
import { parseNotebookId } from "./src/notebooklm";
import { sync } from "./src/sync";

const USAGE = `Usage:
  ytnblm login                         Sign in to Google (opens Chrome)
  ytnblm add <playlist-url> [options]  Add every playlist video as a NotebookLM source

Options for add:
  --notebook <id|url>   Target notebook (default: the one used last time for this playlist, else a new one)
  --max-sources <n>     Per-notebook source limit before splitting into a new notebook (default 300)
  --headed              Show the browser`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    notebook: { type: "string" },
    "max-sources": { type: "string", default: "300" },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, playlistUrl] = positionals;
if (values.help || !command) {
  console.log(USAGE);
  process.exit(command || values.help ? 0 : 1);
}

if (command === "login") {
  await login();
} else if (command === "add" && playlistUrl) {
  const maxSources = Number(values["max-sources"]);
  if (!Number.isInteger(maxSources) || maxSources < 1) throw new Error("--max-sources must be a positive integer");
  const ok = await sync({
    playlistUrl,
    notebookId: values.notebook && parseNotebookId(values.notebook),
    maxSources,
    headed: values.headed,
  });
  process.exit(ok ? 0 : 1);
} else {
  console.error(USAGE);
  process.exit(1);
}
