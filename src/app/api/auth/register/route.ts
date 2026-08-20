import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { hashPassword, createSessionToken, AUTH_COOKIE_NAME } from "../../../../lib/auth";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().email("Please enter a valid email address").toLowerCase(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = registerSchema.parse(body);

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists." },
        { status: 400 }
      );
    }

    // Check if this is the first user (make ADMIN)
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? "ADMIN" : "USER";

    const { hash, salt } = hashPassword(validated.password);

    const user = await prisma.user.create({
      data: {
        name: validated.name.trim(),
        email: validated.email.trim(),
        passwordHash: hash,
        salt,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    // Create session token
    const token = createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      message: "Account created successfully!",
      user,
    });

    // Set secure HTTP-only cookie (7 days)
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
    });

    return response;
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Register error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to register" }, { status: 500 });
  }
}
