import { openContext, NOTEBOOKLM_URL, isNotebookLMHost } from "./browser";

const LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Opens a visible Chrome window; resolves once NotebookLM loads signed-in. */
export async function login(): Promise<void> {
  const ctx = await openContext(false);
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(NOTEBOOKLM_URL);
    console.log("Sign in to Google in the opened window. Waiting up to 10 minutes...");
    await page.waitForURL(isNotebookLMHost, { timeout: LOGIN_TIMEOUT_MS });
    await page.waitForLoadState("networkidle");
    console.log("Signed in. Session saved.");
  } finally {
    await ctx.close();
  }
}
