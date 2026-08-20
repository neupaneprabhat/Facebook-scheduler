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
            pageId: true,
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
    const targetIds = [post.facebookPostId];

    // If ID is compound (e.g. pageId_postId), also try the single postId
    if (post.facebookPostId.includes("_")) {
      const parts = post.facebookPostId.split("_");
      if (parts[1]) targetIds.push(parts[1]);
    }

    let statsData: any = null;

    for (const testId of targetIds) {
      try {
        const fields =
          "reactions.summary(total_count).limit(0),likes.summary(true).limit(0),comments.summary(total_count).limit(0),comments.summary(true),shares,permalink_url";
        const statsRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/${testId}?fields=${fields}&access_token=${pageToken}`
        );
        const data = await statsRes.json();

        if (data && !data.error) {
          statsData = data;
          break;
        } else if (data?.error) {
          console.warn(`FB stats lookup warning for ${testId}:`, data.error.message);
        }
      } catch (err) {
        console.warn(`Fetch error for ${testId}:`, err);
      }
    }

    // Extract reactions / likes count
    const likes =
      statsData?.reactions?.summary?.total_count ??
      statsData?.likes?.summary?.total_count ??
      (Array.isArray(statsData?.likes?.data) ? statsData.likes.data.length : 0);

    // Extract comments count
    const comments =
      statsData?.comments?.summary?.total_count ??
      (Array.isArray(statsData?.comments?.data) ? statsData.comments.data.length : 0);

    // Extract shares count
    const shares = statsData?.shares?.count ?? 0;

    // Direct link to the post
    let postUrl = statsData?.permalink_url;
    if (!postUrl) {
      if (post.mediaType === "VIDEO") {
        postUrl = `https://www.facebook.com/watch/?v=${post.facebookPostId}`;
      } else if (post.facebookPostId.includes("_")) {
        const [pageNumericId, postNumericId] = post.facebookPostId.split("_");
        postUrl = `https://www.facebook.com/permalink.php?story_fbid=${postNumericId}&id=${pageNumericId}`;
      } else {
        // Single Photo ID
        postUrl = `https://www.facebook.com/photo/?fbid=${post.facebookPostId}`;
      }
    }

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
