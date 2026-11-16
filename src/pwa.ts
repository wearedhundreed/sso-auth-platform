export async function registerPwa(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    // PWA installation is optional; do not block authentication if registration fails.
    console.error("PWA service worker registration failed", error instanceof Error ? error.name : "unknown");
  }
}
