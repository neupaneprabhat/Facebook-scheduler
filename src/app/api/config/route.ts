import { NextResponse } from "next/server";
import { isRealFacebookConfigured } from "../../../services/facebook";

export async function GET() {
  return NextResponse.json({
    isRealMetaConfigured: isRealFacebookConfigured(),
    graphApiVersion: process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0",
    defaultTimezone: "Asia/Kathmandu",
  });
}
