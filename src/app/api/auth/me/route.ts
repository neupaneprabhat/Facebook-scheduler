import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, AUTH_COOKIE_NAME } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const session = verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    // ── Env-admin fast path ──────────────────────────────────────────────────
    // On Render (and similar platforms), the SQLite DB is wiped on every restart.
    // If the JWT belongs to the configured admin account, skip the DB lookup so
    // the session survives server restarts without forcing a re-login.
    const envAdminEmail = "admin@facebook-scheduler.com";
    const envAdminUser = (process.env.ADMIN_USERNAME || "admin").trim();
    const isEnvAdmin =
      session.email === envAdminEmail ||
      session.email === `${envAdminUser}@localhost`;

    if (isEnvAdmin) {
      return NextResponse.json({
        authenticated: true,
        user: {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: "ADMIN",
        },
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch (error: any) {
    console.error("Auth me check error:", error);
    return NextResponse.json({ authenticated: false, user: null, error: error.message });
  }
}
