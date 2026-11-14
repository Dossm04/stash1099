import type { Metadata } from "next";
import Quiz from "@/components/Quiz";

export const metadata: Metadata = { title: "60-second tax check for 1099 income — Stash1099" };

export default function StartPage() {
  return <Quiz />;
}
