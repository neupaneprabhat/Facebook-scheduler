import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = (body.token || body.pageToken || "").trim();
    let pageId = (body.pageId || "").trim();

    if (!token && !pageId) {
      return NextResponse.json(
        { success: false, error: "Please provide an Access Token or Page ID." },
        { status: 400 }
      );
    }

    // CASE 1: Only Token provided (or Token + Optional Page ID)
    // First, test if it's a User Access Token that has multiple managed pages (via /me/accounts)
    try {
      const accountsRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,category,access_token,picture{url}&access_token=${token}`
      );
      const accountsData = await accountsRes.json();

      if (accountsData && accountsData.data && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
        // User Token with 1 or more pages! Import all of them!
        const importedPages: any[] = [];
        for (const p of accountsData.data) {
          const enc = encryptToken(p.access_token || token);
          const saved = await prisma.facebookPage.upsert({
            where: { pageId: p.id },
            update: {
              pageName: p.name || `Page (${p.id})`,
              category: p.category || "Facebook Page",
              pictureUrl: p.picture?.data?.url || null,
              pageAccessTokenEncrypted: enc,
              isConnected: true,
            },
            create: {
              pageId: p.id,
              pageName: p.name || `Page (${p.id})`,
              category: p.category || "Facebook Page",
              pictureUrl: p.picture?.data?.url || null,
              pageAccessTokenEncrypted: enc,
              isConnected: true,
            },
          });
          importedPages.push(saved);
        }

        return NextResponse.json({
          success: true,
          message: `Successfully connected ${importedPages.length} Facebook Page(s) automatically!`,
          count: importedPages.length,
          pages: importedPages,
        });
      }
    } catch (e) {
      console.warn("Could not fetch /me/accounts:", e);
    }

    // Next, test if the token belongs directly to a Page (/me)
    let detectedPageId = pageId;
    let pageName = `Facebook Page (${pageId || "Custom"})`;
    let pictureUrl: string | null = null;
    let category: string | null = "Facebook Page";

    try {
      const meTarget = detectedPageId ? detectedPageId : "me";
      const meRes = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${meTarget}?fields=id,name,category,picture{url}&access_token=${token}`
      );
      const meData = await meRes.json();

      if (meData && !meData.error && meData.id) {
        detectedPageId = meData.id;
        pageName = meData.name || pageName;
        category = meData.category || category;
        pictureUrl = meData.picture?.data?.url || null;
      } else if (meData?.error) {
        console.warn("Graph API error verifying token:", meData.error);
        if (!detectedPageId) {
          return NextResponse.json(
            { success: false, error: meData.error.message || "Invalid Access Token." },
            { status: 400 }
          );
        }
      }
    } catch (e: any) {
      console.warn("Token lookup failed:", e);
    }

    if (!detectedPageId) {
      return NextResponse.json(
        { success: false, error: "Could not detect Page ID from token. Please enter the Page ID manually." },
        { status: 400 }
      );
    }

    const encryptedToken = encryptToken(token);

    const page = await prisma.facebookPage.upsert({
      where: { pageId: detectedPageId },
      update: {
        pageName,
        category,
        pictureUrl,
        pageAccessTokenEncrypted: encryptedToken,
        isConnected: true,
      },
      create: {
        pageId: detectedPageId,
        pageName,
        category,
        pictureUrl,
        pageAccessTokenEncrypted: encryptedToken,
        isConnected: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Connected "${pageName}" successfully!`,
      page: {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        category: page.category,
        pictureUrl: page.pictureUrl,
        isConnected: page.isConnected,
      },
    });
  } catch (error: any) {
    console.error("Manual connect error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
