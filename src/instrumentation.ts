export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only run on the server-side Node.js runtime
    const { startBackgroundScheduler } = await import("./lib/scheduler");
    startBackgroundScheduler();
  }
}
