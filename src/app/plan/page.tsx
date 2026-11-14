import type { Metadata } from "next";
import PlanApp from "@/components/PlanApp";

export const metadata: Metadata = { title: "Your 2026 tax set-aside plan — Stash1099" };

export default function PlanPage() {
  return <PlanApp />;
}
