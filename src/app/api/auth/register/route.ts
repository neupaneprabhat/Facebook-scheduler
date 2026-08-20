import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Public registration is disabled. Only authorized developers can log in.",
    },
    { status: 403 }
  );
}
