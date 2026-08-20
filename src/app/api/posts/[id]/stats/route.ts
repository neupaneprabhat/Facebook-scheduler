import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { decryptToken } from "../../../../../lib/crypto";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

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
            pageAccessTokenEncrypted: true,
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    if (post.status !== "PUBLISHED" || !post.facebookPostId) {
      return NextResponse.json({
        success: true,
        stats: null,
        reason: "Post is not published yet",
      });
    }

    const pageToken = decryptToken(post.facebookPage.pageAccessTokenEncrypted);

    // Fetch real stats from Facebook Graph API
    const statsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${post.facebookPostId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${pageToken}`
    );

    const statsData = await statsRes.json();

    if (statsData.error) {
      console.warn("FB stats error:", statsData.error);
      return NextResponse.json({
        success: true,
        stats: {
          likes: 0,
          comments: 0,
          shares: 0,
          postUrl: `https://www.facebook.com/${post.facebookPostId}`,
        },
      });
    }

    const likes = statsData.likes?.summary?.total_count ?? 0;
    const comments = statsData.comments?.summary?.total_count ?? 0;
    const shares = statsData.shares?.count ?? 0;
    const facebookPageNumericId = post.facebookPostId?.split("_")[0];
    const postUrl = `https://www.facebook.com/permalink.php?story_fbid=${post.facebookPostId?.split("_")[1]}&id=${facebookPageNumericId}`;

    return NextResponse.json({
      success: true,
      stats: {
        likes,
        comments,
        shares,
        postUrl,
      },
    });
  } catch (error: any) {
    console.error("Stats fetch error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
