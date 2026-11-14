import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ProGateProvider } from "@/components/ProGate";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stash1099 — payroll for one: how much of your money is actually yours",
  description:
    "For US freelancers and gig workers: every payout becomes a paycheck with tax withheld. See what is safe to spend, exactly how much to set aside, and the IRS minimum for each deadline. No signup, no bank login.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <ProGateProvider>{children}</ProGateProvider>
      </body>
    </html>
  );
}
