import { prisma } from "../prisma";
import { executePostPublishing } from "../../services/facebook";

let isRunnerStarted = false;
let pollerInterval: NodeJS.Timeout | null = null;

// Track already-scheduled post timers to avoid double-firing
const scheduledTimers = new Map<string, NodeJS.Timeout>();

/**
 * Checks database for any scheduled posts that have reached their scheduled time
 * and executes publishing automatically.
 */
export async function processDuePosts(): Promise<{ processedCount: number; results: any[] }> {
  const now = new Date();

  // Find all posts that are SCHEDULED and ready to be published
  const duePosts = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: {
        lte: now,
      },
    },
    include: {
      facebookPage: true,
    },
    take: 10, // Process in batches
  });

  const results: any[] = [];

  for (const post of duePosts) {
    // Skip if a dedicated timer is already handling this post
    if (scheduledTimers.has(post.id)) {
      continue;
    }

    console.log(`[Scheduler] Processing due post ${post.id} scheduled for ${post.scheduledAt.toISOString()}`);
    try {
      const res = await executePostPublishing(post.id);
      results.push({ postId: post.id, result: res });
    } catch (err: any) {
      console.error(`[Scheduler] Failed to execute post ${post.id}:`, err);
      results.push({ postId: post.id, error: err.message });
    }
  }

  return { processedCount: duePosts.length, results };
}

/**
 * Starts the automatic in-process background runner.
 * Safe to call multiple times (singleton guard).
 */
export function startBackgroundScheduler(intervalMs = 10000) {
  if (isRunnerStarted) return;
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }
  isRunnerStarted = true;

  console.log(`[Scheduler] Automatic Background Runner initialized (polling every ${intervalMs / 1000}s)`);

  // Run immediate initial check
  processDuePosts().catch((err) => console.error("[Scheduler] Initial check error:", err));

  // Run periodic polling - catches any missed posts (server restarts, timer drift, posts > 1h)
  pollerInterval = setInterval(async () => {
    try {
      await processDuePosts();
    } catch (error) {
      console.error("[Scheduler] Poller error:", error);
    }
  }, intervalMs);

  if (pollerInterval && typeof pollerInterval.unref === "function") {
    pollerInterval.unref();
  }
}

/**
 * Registers a specific post for scheduled execution.
 * ALWAYS sets an exact setTimeout for the post's scheduled time,
 * regardless of how far in the future it is.
 */
export function schedulePostJob(postId: string, scheduledAt: Date) {
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  const delay = scheduledAt.getTime() - Date.now();

  console.log(`[Scheduler] Post ${postId} registered. Scheduled at ${scheduledAt.toISOString()} (in ${Math.round(delay / 1000)}s)`);

  // Clear any existing timer for this post (e.g. on edit)
  if (scheduledTimers.has(postId)) {
    clearTimeout(scheduledTimers.get(postId)!);
    scheduledTimers.delete(postId);
  }

  if (delay <= 0) {
    // Already due, execute immediately in background
    const t = setTimeout(() => {
      scheduledTimers.delete(postId);
      executePostPublishing(postId).catch((err) => console.error(`[Scheduler] Execution error for ${postId}:`, err));
    }, 200);
    if (t && typeof t.unref === "function") t.unref();
  } else {
    // ALWAYS set an exact timer, even for posts far in the future
    // The poller acts as a safety net for server restarts
    const timer = setTimeout(() => {
      scheduledTimers.delete(postId);
      console.log(`[Scheduler] Exact timer fired for post ${postId}`);
      executePostPublishing(postId).catch((err) =>
        console.error(`[Scheduler] Exact timer execution error for ${postId}:`, err)
      );
    }, delay);

    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }

    scheduledTimers.set(postId, timer);
  }

  // Ensure background runner is active as a safety net
  startBackgroundScheduler();
}

