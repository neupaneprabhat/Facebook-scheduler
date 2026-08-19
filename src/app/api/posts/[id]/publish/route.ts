import { NextRequest, NextResponse } from "next/server";
import { retryFacebookPost } from "@/services/facebook";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await retryFacebookPost(params.id);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Post published to Facebook successfully",
        facebookPostId: result.facebookPostId,
        isSimulated: result.isSimulated,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage || "Failed to publish post to Facebook",
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
