import { NextRequest, NextResponse } from "next/server";
import { connectFacebook, getFacebookPages, getFacebookLoginUrl, isRealFacebookConfigured } from "../../../../services/facebook";
import { prisma } from "../../../../lib/prisma";
import { encryptToken } from "../../../../lib/crypto";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  // If user requested login URL
  if (searchParams.get("action") === "login") {
    if (!isRealFacebookConfigured()) {
      return NextResponse.redirect(`${appUrl}/?connected=mock`);
    }
    const loginUrl = getFacebookLoginUrl();
    return NextResponse.redirect(loginUrl);
  }

  // Handle Meta OAuth errors
  if (error) {
    console.error("Facebook OAuth Error:", error, errorDescription);
    return NextResponse.redirect(`${appUrl}/?auth_error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/?auth_error=No+authorization+code+received`);
  }

  try {
    // Exchange code for user access token
    const { accessToken: userToken } = await connectFacebook(code);

    // Fetch managed Facebook Pages
    const pages = await getFacebookPages(userToken);

    if (pages.length === 0) {
      return NextResponse.redirect(`${appUrl}/?auth_warning=No+manageable+Facebook+Pages+found`);
    }

    // Save/update pages in database with encrypted page tokens
    for (const p of pages) {
      const encrypted = encryptToken(p.accessToken);
      await prisma.facebookPage.upsert({
        where: { pageId: p.id },
        update: {
          pageName: p.name,
          category: p.category,
          pictureUrl: p.pictureUrl,
          pageAccessTokenEncrypted: encrypted,
          isConnected: true,
        },
        create: {
          pageId: p.id,
          pageName: p.name,
          category: p.category,
          pictureUrl: p.pictureUrl,
          pageAccessTokenEncrypted: encrypted,
          isConnected: true,
        },
      });
    }

    return NextResponse.redirect(`${appUrl}/?connected=success`);
  } catch (err: any) {
    console.error("OAuth callback processing error:", err);
    return NextResponse.redirect(`${appUrl}/?auth_error=${encodeURIComponent(err.message || "Failed to connect Facebook")}`);
  }
}
