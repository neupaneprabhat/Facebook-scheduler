import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptToken } from "@/lib/crypto";

export async function POST() {
  try {
    // Seed or connect realistic mock Facebook pages for dev/demo mode
    const mockPages = [
      {
        pageId: "109823485023910",
        pageName: "Black History Official",
        category: "Community Organization",
        pictureUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        rawToken: "mock_page_token_black_history_official_secret",
      },
      {
        pageId: "109823485023911",
        pageName: "Tech Pulse Daily",
        category: "Media / News Company",
        pictureUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=150&auto=format&fit=crop&q=80",
        rawToken: "mock_page_token_tech_pulse_daily_secret",
      },
      {
        pageId: "109823485023912",
        pageName: "Creative Studio Agency",
        category: "Design Agency",
        pictureUrl: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=150&auto=format&fit=crop&q=80",
        rawToken: "mock_page_token_creative_studio_secret",
      },
    ];

    const connectedPages = [];
    for (const p of mockPages) {
      const encrypted = encryptToken(p.rawToken);
      const page = await prisma.facebookPage.upsert({
        where: { pageId: p.pageId },
        update: {
          pageName: p.pageName,
          category: p.category,
          pictureUrl: p.pictureUrl,
          pageAccessTokenEncrypted: encrypted,
          isConnected: true,
        },
        create: {
          pageId: p.pageId,
          pageName: p.pageName,
          category: p.category,
          pictureUrl: p.pictureUrl,
          pageAccessTokenEncrypted: encrypted,
          isConnected: true,
        },
      });
      connectedPages.push({
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        category: page.category,
        pictureUrl: page.pictureUrl,
        isConnected: page.isConnected,
        isSimulated: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Facebook demo account connected with managed pages",
      pages: connectedPages,
      selectedPageId: connectedPages[0].id,
    });
  } catch (error: any) {
    console.error("Mock connect error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
