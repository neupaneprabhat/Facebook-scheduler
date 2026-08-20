import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { hashPassword, verifyPassword, createSessionToken, AUTH_COOKIE_NAME } from "../../../../lib/auth";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = loginSchema.parse(body);
    const inputIdentifier = validated.username.trim();
    const inputPassword = validated.password;

    const envAdminUser = (process.env.ADMIN_USERNAME || "admin").trim();
    const envAdminPass = process.env.ADMIN_PASSWORD || "admin123456";
    const envAdminEmail = "admin@facebook-scheduler.com";

    // 1. Check if matches configured Developer / Admin credentials
    const isEnvAdminMatch =
      (inputIdentifier.toLowerCase() === envAdminUser.toLowerCase() ||
        inputIdentifier.toLowerCase() === envAdminEmail.toLowerCase()) &&
      inputPassword === envAdminPass;

    if (isEnvAdminMatch) {
      // Ensure the Admin User exists in DB
      let user = await prisma.user.findFirst({
        where: {
          OR: [{ email: envAdminEmail }, { email: `${envAdminUser}@localhost` }],
        },
      });

      if (!user) {
        const { hash, salt } = hashPassword(envAdminPass);
        user = await prisma.user.create({
          data: {
            name: "Lead Developer",
            email: envAdminEmail,
            passwordHash: hash,
            salt,
            role: "ADMIN",
          },
        });
      }

      const token = createSessionToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: "ADMIN",
      });

      const response = NextResponse.json({
        success: true,
        message: "Developer login successful!",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: "ADMIN",
        },
      });

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
    }

    // 2. Check Database users
    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: inputIdentifier.toLowerCase() },
          { name: { equals: inputIdentifier } },
        ],
      },
    });

    if (dbUser && verifyPassword(inputPassword, dbUser.passwordHash, dbUser.salt)) {
      const token = createSessionToken({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
      });

      const response = NextResponse.json({
        success: true,
        message: "Login successful!",
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
        },
      });

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
    }

    return NextResponse.json(
      { success: false, error: "Invalid developer username or password." },
      { status: 401 }
    );
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }
    console.error("Login error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to log in" }, { status: 500 });
  }
}
