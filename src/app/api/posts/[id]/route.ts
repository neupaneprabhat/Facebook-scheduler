import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { schedulePostJob, cancelPostJob } from "../../../../lib/scheduler";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const post = await prisma.post.findUnique({
      where: { id: params.id },
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

    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, post });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const existing = await prisma.post.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    if (existing.status === "PUBLISHED") {
      return NextResponse.json(
        { success: false, error: "Cannot edit a post that has already been published to Facebook" },
        { status: 400 }
      );
    }

    const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : existing.scheduledAt;

    let mediaUrlsStr = existing.mediaUrls;
    if (body.mediaUrls !== undefined) {
      if (Array.isArray(body.mediaUrls)) {
        mediaUrlsStr = JSON.stringify(body.mediaUrls);
      } else {
        mediaUrlsStr = body.mediaUrls;
      }
    }

    let computedMediaType = existing.mediaType;
    if (body.mediaUrls && Array.isArray(body.mediaUrls) && body.mediaUrls.length > 1) {
      computedMediaType = "MULTI_IMAGE";
    } else if (body.videoUrl) {
      computedMediaType = "VIDEO";
    } else if (body.imageUrl || (body.mediaUrls && body.mediaUrls.length === 1)) {
      computedMediaType = "IMAGE";
    } else if (body.caption && !body.imageUrl && !body.videoUrl && (!body.mediaUrls || body.mediaUrls.length === 0)) {
      computedMediaType = "NONE";
    }

    const updated = await prisma.post.update({
      where: { id: params.id },
      data: {
        facebookPageId: body.facebookPageId || existing.facebookPageId,
        caption: body.caption !== undefined ? body.caption : existing.caption,
        imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
        videoUrl: body.videoUrl !== undefined ? body.videoUrl : existing.videoUrl,
        mediaUrls: mediaUrlsStr,
        mediaType: body.mediaType || computedMediaType,
        scheduledAt: scheduledDate,
        timezone: body.timezone || existing.timezone,
        status: "SCHEDULED", // reset status back to scheduled if it was failed
        errorMessage: null,
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

    // Re-register in scheduler
    schedulePostJob(updated.id, updated.scheduledAt);

    return NextResponse.json({
      success: true,
      message: "Post updated successfully",
      post: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.post.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    cancelPostJob(params.id);
    await prisma.post.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: "Scheduled post deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
