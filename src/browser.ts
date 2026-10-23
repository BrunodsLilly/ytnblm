import { chromium, type BrowserContext } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";

export const NOTEBOOKLM_URL = "https://notebook.google.com/";
/** NotebookLM moved from notebooklm.google.com; the old host redirects. */
export const isNotebookLMHost = (url: URL) =>
  url.hostname === "notebook.google.com" || url.hostname === "notebooklm.google.com";

export const PROFILE_DIR =
  process.env.YTNBLM_PROFILE ?? join(homedir(), ".ytnblm", "chrome-profile");

/**
 * Persistent Chrome profile so the Google login survives between runs.
 * Uses installed Google Chrome (channel "chrome") and drops the automation flag:
 * Google sign-in rejects Playwright's bundled Chromium as "not secure".
 */
export function openContext(headless: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless,
    viewport: { width: 1400, height: 900 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
}
