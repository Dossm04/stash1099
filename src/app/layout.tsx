import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stash1099 — how much of your balance is actually yours",
  description:
    "For US freelancers and gig workers: see what is safe to spend, exactly how much of every payout to set aside for taxes, and the IRS minimum for each deadline. No signup, no bank login.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>{children}</body>
    </html>
  );
}
