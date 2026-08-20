import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET() {
  try {
    const pages = await prisma.facebookPage.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        category: true,
        pictureUrl: true,
        isConnected: true,
        createdAt: true,
        _count: {
          select: { posts: true },
        },
      },
    });

    return NextResponse.json({ success: true, pages });
  } catch (error: any) {
    console.error("Fetch pages error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing page id" }, { status: 400 });
    }

    await prisma.facebookPage.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Page disconnected" });
  } catch (error: any) {
    console.error("Disconnect page error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
