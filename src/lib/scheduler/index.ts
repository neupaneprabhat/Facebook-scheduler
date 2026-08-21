import { prisma } from "../prisma";
import { executePostPublishing } from "../../services/facebook";

interface GlobalSchedulerState {
  isRunnerStarted: boolean;
  pollerInterval: NodeJS.Timeout | null;
  scheduledTimers: Map<string, NodeJS.Timeout>;
  isProcessing: boolean;
}

const globalForScheduler = globalThis as unknown as {
  __fb_scheduler_state__?: GlobalSchedulerState;
};

if (!globalForScheduler.__fb_scheduler_state__) {
  globalForScheduler.__fb_scheduler_state__ = {
    isRunnerStarted: false,
    pollerInterval: null,
    scheduledTimers: new Map<string, NodeJS.Timeout>(),
    isProcessing: false,
  };
}

const schedulerState = globalForScheduler.__fb_scheduler_state__;

/**
 * Recovers posts that may have been interrupted mid-flight during a server restart/crash.
 */
async function recoverInterruptedPosts() {
  try {
    // 1. Find any posts stuck in 'PUBLISHING' state
    const interruptedPosts = await prisma.post.findMany({
      where: { status: "PUBLISHING" },
      select: { id: true, facebookPostId: true },
    });

    if (interruptedPosts.length > 0) {
      console.log(`[Scheduler] Found ${interruptedPosts.length} post(s) stuck in PUBLISHING from previous session. Recovering...`);
      for (const p of interruptedPosts) {
        if (p.facebookPostId) {
          // It actually got published before the server restarted
          await prisma.post.update({
            where: { id: p.id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
        } else {
          // Reset to SCHEDULED so the scheduler will re-attempt publishing safely
          await prisma.post.update({
            where: { id: p.id },
            data: { status: "SCHEDULED", errorMessage: null },
          });
        }
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error recovering interrupted posts:", err);
  }
}

/**
 * Checks database for any scheduled posts that have reached their scheduled time
 * and executes publishing automatically.
 */
export async function processDuePosts(): Promise<{ processedCount: number; results: any[] }> {
  if (schedulerState.isProcessing) {
    return { processedCount: 0, results: [] };
  }

  schedulerState.isProcessing = true;
  const results: any[] = [];

  try {
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
      take: 10, // Process in batches to manage throughput
    });

    for (const post of duePosts) {
      // Clear any pending timer handle
      if (schedulerState.scheduledTimers.has(post.id)) {
        clearTimeout(schedulerState.scheduledTimers.get(post.id)!);
        schedulerState.scheduledTimers.delete(post.id);
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
  } catch (error) {
    console.error("[Scheduler] Error in processDuePosts:", error);
    return { processedCount: 0, results };
  } finally {
    schedulerState.isProcessing = false;
  }
}

/**
 * Restores all future pending scheduled posts from the database after a server restart.
 */
async function restoreUpcomingScheduledPosts() {
  try {
    const now = new Date();
    const futurePosts = await prisma.post.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gt: now },
      },
      select: { id: true, scheduledAt: true },
    });

    if (futurePosts.length > 0) {
      console.log(`[Scheduler] Restoring ${futurePosts.length} upcoming scheduled post timer(s) after restart`);
      for (const post of futurePosts) {
        schedulePostJob(post.id, post.scheduledAt);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error restoring upcoming posts on startup:", err);
  }
}

/**
 * Starts the automatic in-process background runner.
 * Resilient to server restarts and safe to call multiple times.
 */
export function startBackgroundScheduler(intervalMs = 10000) {
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  if (schedulerState.isRunnerStarted) {
    return;
  }
  schedulerState.isRunnerStarted = true;

  console.log(`[Scheduler] Background Runner started (polling every ${intervalMs / 1000}s). Restoring state from database...`);

  // Run full startup restoration:
  // 1. Recover in-flight/stuck posts
  // 2. Process overdue posts immediately
  // 3. Re-register timers for future posts
  (async () => {
    await recoverInterruptedPosts();
    await processDuePosts();
    await restoreUpcomingScheduledPosts();
    console.log(`[Scheduler] Startup state restoration complete. Active timers: ${schedulerState.scheduledTimers.size}`);
  })().catch((err) => console.error("[Scheduler] Startup recovery error:", err));

  // Run periodic polling safety net - catches any missed posts (server restarts, timer drift, future dates)
  if (!schedulerState.pollerInterval) {
    schedulerState.pollerInterval = setInterval(async () => {
      try {
        await processDuePosts();
      } catch (error) {
        console.error("[Scheduler] Poller error:", error);
      }
    }, intervalMs);

    if (schedulerState.pollerInterval && typeof schedulerState.pollerInterval.unref === "function") {
      schedulerState.pollerInterval.unref();
    }
  }
}

/**
 * Registers a specific post for scheduled execution.
 * Sets an exact timer for the post's scheduled time.
 */
export function schedulePostJob(postId: string, scheduledAt: Date) {
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  const delay = scheduledAt.getTime() - Date.now();

  // Clear any existing timer for this post (e.g. on edit or reschedule)
  cancelPostJob(postId);

  if (delay <= 0) {
    // Already due, execute immediately in background
    const t = setTimeout(() => {
      schedulerState.scheduledTimers.delete(postId);
      executePostPublishing(postId).catch((err) => console.error(`[Scheduler] Execution error for ${postId}:`, err));
    }, 200);
    if (t && typeof t.unref === "function") t.unref();
  } else {
    // Set an exact timer
    const timer = setTimeout(() => {
      schedulerState.scheduledTimers.delete(postId);
      console.log(`[Scheduler] Exact timer fired for post ${postId}`);
      executePostPublishing(postId).catch((err) =>
        console.error(`[Scheduler] Exact timer execution error for ${postId}:`, err)
      );
    }, delay);

    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }

    schedulerState.scheduledTimers.set(postId, timer);
    console.log(`[Scheduler] Post ${postId} scheduled for ${scheduledAt.toISOString()} (in ${Math.round(delay / 1000)}s). Active timers: ${schedulerState.scheduledTimers.size}`);
  }

  // Ensure background runner is active as a safety net
  startBackgroundScheduler();
}

/**
 * Cancels any active timer for a post (e.g. when deleted or modified)
 */
export function cancelPostJob(postId: string) {
  if (schedulerState.scheduledTimers.has(postId)) {
    clearTimeout(schedulerState.scheduledTimers.get(postId)!);
    schedulerState.scheduledTimers.delete(postId);
  }
}

/**
 * Returns current scheduler operational statistics
 */
export function getSchedulerStats() {
  return {
    isRunning: schedulerState.isRunnerStarted,
    activeTimersCount: schedulerState.scheduledTimers.size,
    isProcessing: schedulerState.isProcessing,
  };
}
