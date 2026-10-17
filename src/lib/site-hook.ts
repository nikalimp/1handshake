import "server-only";

/**
 * The site (1handshake.com) is static: its event calendar is built from /api/events.
 * When an approved event changes, its Vercel Deploy Hook rebuilds it. Does nothing until
 * SITE_DEPLOY_HOOK_URL is set.
 */
export async function rebuildSite() {
  const hook = process.env.SITE_DEPLOY_HOOK_URL;
  if (!hook?.startsWith("https://")) return;
  try {
    await fetch(hook, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch {
    // the calendar in the browser loads fresh events anyway
  }
}
