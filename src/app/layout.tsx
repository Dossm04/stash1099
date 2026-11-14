import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stash1099 — never get an IRS underpayment penalty again",
  description:
    "For US freelancers and gig workers: know exactly how much of every payment to set aside, what to pay by each IRS deadline, and how to stop the underpayment penalty. No signup.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>{children}</body>
    </html>
  );
}
