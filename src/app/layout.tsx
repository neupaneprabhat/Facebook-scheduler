import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facebook Post Scheduler - Plan • Schedule • Publish",
  description: "Connect your Facebook Page, create posts, and schedule automatic publishing with Meta Graph API.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-900 bg-[#F0F2F5] min-h-screen">
        {children}
      </body>
    </html>
  );
}
