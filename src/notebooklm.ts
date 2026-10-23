import type { Page } from "playwright";
import { NOTEBOOKLM_URL } from "./browser";

const NOTEBOOK_ID_RE = /\/notebook\/([0-9a-f-]{36})/;

/** Accepts a bare notebook id or any NotebookLM notebook URL. */
export function parseNotebookId(input: string): string {
  const id = input.match(NOTEBOOK_ID_RE)?.[1] ?? input;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`Not a NotebookLM notebook id/URL: ${input}`);
  return id;
}

/** One-off announcement dialogs ("Limits refresh every 5 hours", ...) block clicks. */
async function dismissPromos(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: "Close dialog" });
  if (await close.isVisible()) await close.click();
}

async function assertSignedIn(page: Page): Promise<void> {
  if (new URL(page.url()).hostname === "accounts.google.com") {
    throw new Error("Not signed in to Google. Run `ytnblm login` first.");
  }
}

/** Creates an empty notebook and returns its id. */
export async function createNotebook(page: Page): Promise<string> {
  await page.goto(NOTEBOOKLM_URL);
  await assertSignedIn(page);
  await dismissPromos(page);
  await page.getByRole("button", { name: "New notebook" }).click();
  await page.waitForURL(NOTEBOOK_ID_RE);
  return page.url().match(NOTEBOOK_ID_RE)![1]!;
}

/** Renames the open notebook. Named notebooks keep their title instead of NotebookLM's auto-title. */
export async function renameNotebook(page: Page, title: string): Promise<void> {
  await dismissPromos(page);
  const titleInput = page.locator("input.title-input");
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await titleInput.blur();
}

/**
 * Loads a notebook and returns the YouTube video ids of its sources, one entry per source
 * (duplicates kept). Read from the page's own "get notebook" RPC (rpcid rLM1Ne), where each
 * YouTube source carries ["https://www.youtube.com/watch?v=<id>", "<id>", "<channel>"].
 * Titles can't be used: YouTube retitles and A/B-tests video titles.
 */
export async function openNotebook(page: Page, id: string): Promise<string[]> {
  // Proxy the RPC through page.route so we hold the body ourselves: reading it back from
  // the browser via waitForResponse intermittently fails ("No data found for resource").
  const matches = (url: URL) =>
    url.searchParams.get("rpcids") === "rLM1Ne" && url.searchParams.get("source-path") === `/notebook/${id}`;
  const { promise: rpcBody, resolve, reject } = Promise.withResolvers<string>();
  const timer = setTimeout(() => reject(new Error(`Notebook ${id}: no rLM1Ne response in 30s`)), 30_000);
  await page.route(matches, async (route) => {
    const response = await route.fetch();
    resolve(await response.text());
    // The previous page may have fired this RPC just before goto cancelled it; its body is
    // still current server state, but the request can no longer be fulfilled.
    await route.fulfill({ response }).catch(() => {});
  });
  let body: string;
  try {
    await page.goto(new URL(`notebook/${id}`, NOTEBOOKLM_URL).href);
    await assertSignedIn(page);
    body = await rpcBody;
  } finally {
    clearTimeout(timer);
    await page.unroute(matches);
  }
  await dismissPromos(page);
  await page.getByRole("button", { name: "Add source" }).waitFor();
  // Body is JSON nested in JSON strings, so "=" may arrive escaped as \u003d.
  return [...body.matchAll(/"https:\/\/www\.youtube\.com\/watch\?v(?:=|\\+u003d)([\w-]{11})\\*"/g)].map(
    (m) => m[1]!,
  );
}

export async function addUrls(page: Page, urls: string[]): Promise<void> {
  await dismissPromos(page);
  // Empty notebooks auto-open the add-source dialog; otherwise open it.
  const websites = page.getByRole("button", { name: "Websites" });
  if (!(await websites.isVisible())) await page.getByRole("button", { name: "Add source" }).click();
  await websites.click();
  await page.getByRole("textbox", { name: "Enter URLs" }).fill(urls.join("\n"));
  await page.getByRole("button", { name: "Insert" }).click();
  await page.getByRole("textbox", { name: "Enter URLs" }).waitFor({ state: "detached" });
}

/**
 * Reloads the notebook until every expected video id is a source or the deadline passes.
 * Returns the ids that never appeared.
 */
export async function waitForVideos(
  page: Page,
  notebookId: string,
  expected: string[],
  timeoutMs: number,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const present = new Set(await openNotebook(page, notebookId));
    const missing = expected.filter((v) => !present.has(v));
    if (missing.length === 0 || Date.now() > deadline) return missing;
    await page.waitForTimeout(5000);
  }
}
