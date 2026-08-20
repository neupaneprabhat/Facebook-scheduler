import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { schedulePostJob, startBackgroundScheduler } from "../../../lib/scheduler";
import { z } from "zod";

// Initialize scheduler runner and re-register all pending posts on startup
startBackgroundScheduler();

// Re-register timers for all SCHEDULED future posts after server restart
(async () => {
  try {
    const now = new Date();
    const pendingPosts = await prisma.post.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gt: now },
      },
      select: { id: true, scheduledAt: true },
    });

    if (pendingPosts.length > 0) {
      console.log(`[Scheduler] Re-registering ${pendingPosts.length} pending scheduled post(s) after startup`);
      for (const post of pendingPosts) {
        schedulePostJob(post.id, post.scheduledAt);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Failed to re-register pending posts on startup:", err);
  }
})();


const createPostSchema = z.object({
  facebookPageId: z.string().optional().nullable(),
  facebookPageIds: z.array(z.string()).optional().nullable(),
  caption: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  mediaUrls: z.array(z.string()).optional().nullable(),
  mediaType: z.enum(["NONE", "IMAGE", "VIDEO", "MULTI_IMAGE"]).default("NONE"),
  scheduledAt: z.string().min(1, "Scheduled date and time is required"),
  timezone: z.string().default("UTC"),
}).refine(
  (data) =>
    Boolean(data.facebookPageId) || (data.facebookPageIds && data.facebookPageIds.length > 0),
  { message: "At least one Facebook Page selection is required" }
).refine(
  (data) =>
    (data.caption && data.caption.trim().length > 0) ||
    (data.imageUrl && data.imageUrl.trim().length > 0) ||
    (data.videoUrl && data.videoUrl.trim().length > 0) ||
    (data.mediaUrls && data.mediaUrls.length > 0),
  { message: "Either a post caption, image(s), or a video is required" }
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      include: {
        facebookPage: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            pictureUrl: true,
            category: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, posts });
  } catch (error: any) {
    console.error("Fetch posts error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createPostSchema.parse(body);

    const scheduledDate = new Date(validated.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Invalid scheduled date/time format" },
        { status: 400 }
      );
    }

    // Determine target page IDs (support both single page and multi-page posting)
    const targetPageIds: string[] = [];
    if (validated.facebookPageIds && validated.facebookPageIds.length > 0) {
      targetPageIds.push(...validated.facebookPageIds);
    } else if (validated.facebookPageId) {
      targetPageIds.push(validated.facebookPageId);
    }

    if (targetPageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Please select at least one Facebook Page" },
        { status: 400 }
      );
    }

    // Verify all Facebook Pages exist and are connected
    const pages = await prisma.facebookPage.findMany({
      where: { id: { in: targetPageIds }, isConnected: true },
    });

    if (pages.length === 0) {
      return NextResponse.json(
        { success: false, error: "No connected Facebook Pages found for selection" },
        { status: 400 }
      );
    }

    // Media type & URLs determination
    let mediaUrlsStr: string | null = null;
    let mediaType = validated.mediaType;

    if (validated.mediaUrls && validated.mediaUrls.length > 1) {
      mediaType = "MULTI_IMAGE";
      mediaUrlsStr = JSON.stringify(validated.mediaUrls);
    } else if (validated.mediaUrls && validated.mediaUrls.length === 1) {
      mediaType = "IMAGE";
      mediaUrlsStr = JSON.stringify(validated.mediaUrls);
    } else if (validated.videoUrl && validated.videoUrl.trim() !== "") {
      mediaType = "VIDEO";
    } else if (validated.imageUrl && validated.imageUrl.trim() !== "") {
      mediaType = "IMAGE";
    }

    const createdPosts: any[] = [];

    // Create post for each selected page
    for (const page of pages) {
      const post = await prisma.post.create({
        data: {
          facebookPageId: page.id,
          caption: validated.caption ? validated.caption.trim() : null,
          imageUrl: validated.imageUrl ? validated.imageUrl.trim() : (validated.mediaUrls?.[0] || null),
          videoUrl: validated.videoUrl ? validated.videoUrl.trim() : null,
          mediaUrls: mediaUrlsStr,
          mediaType,
          scheduledAt: scheduledDate,
          timezone: validated.timezone,
          status: "SCHEDULED",
        },
        include: {
          facebookPage: {
            select: {
              id: true,
              pageId: true,
              pageName: true,
              pictureUrl: true,
            },
          },
        },
      });

      // Register in background scheduler
      schedulePostJob(post.id, post.scheduledAt);
      createdPosts.push(post);
    }

    return NextResponse.json({
      success: true,
      message: createdPosts.length > 1
        ? `Successfully scheduled post across ${createdPosts.length} Facebook Pages!`
        : "Post scheduled successfully!",
      post: createdPosts[0],
      posts: createdPosts,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Create post error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const pageId = searchParams.get("pageId");

    const where: any = {};
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (pageId && pageId !== "ALL") {
      where.facebookPageId = pageId;
    }

    const result = await prisma.post.deleteMany({
      where,
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} post(s) successfully`,
      count: result.count,
    });
  } catch (error: any) {
    console.error("Bulk delete posts error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
