import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { encryptToken } from "../../../../lib/crypto";

export const dynamic = "force-dynamic";

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

/**
 * POST /api/facebook/update-token
 * Body: { pageId: string, token: string }
 * Forces a token update for an existing page AND all historical posts published to it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = (body.token || "").trim();

    if (!token) {
      return NextResponse.json({ success: false, error: "Token is required." }, { status: 400 });
    }

    // Validate token with Meta first
    const meRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token,picture{url}&access_token=${token}`
    );
    const meData = await meRes.json();

    if (meData.error) {
      // Try as page token directly
      const pageRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me?fields=id,name,picture{url}&access_token=${token}`
      );
      const pageData = await pageRes.json();
      if (pageData.error) {
        return NextResponse.json(
          { success: false, error: `Token is invalid: ${pageData.error.message}` },
          { status: 400 }
        );
      }
      // Update single page by its FB page ID
      const enc = encryptToken(token);
      await prisma.facebookPage.upsert({
        where: { pageId: pageData.id },
        update: { pageAccessTokenEncrypted: enc, pageName: pageData.name, isConnected: true },
        create: {
          pageId: pageData.id,
          pageName: pageData.name,
          pictureUrl: pageData.picture?.data?.url || null,
          category: "Facebook Page",
          pageAccessTokenEncrypted: enc,
          isConnected: true,
        },
      });
      return NextResponse.json({
        success: true,
        message: `Token updated for page "${pageData.name}". Stats will now work!`,
      });
    }

    // User token with multiple pages: update all of them
    const updatedPages: string[] = [];
    if (meData.data && Array.isArray(meData.data)) {
      for (const p of meData.data) {
        const pageToken = p.access_token || token;
        const enc = encryptToken(pageToken);
        await prisma.facebookPage.upsert({
          where: { pageId: p.id },
          update: {
            pageAccessTokenEncrypted: enc,
            pageName: p.name,
            pictureUrl: p.picture?.data?.url || null,
            isConnected: true,
          },
          create: {
            pageId: p.id,
            pageName: p.name,
            pictureUrl: p.picture?.data?.url || null,
            category: p.category || "Facebook Page",
            pageAccessTokenEncrypted: enc,
            isConnected: true,
          },
        });
        updatedPages.push(p.name);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Token refreshed for ${updatedPages.length} page(s): ${updatedPages.join(", ")}. Stats will now work!`,
      pages: updatedPages,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
