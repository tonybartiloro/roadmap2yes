import type { Metadata } from "next";
import { BudgetOverview } from "@/features/budget/BudgetOverview";
import { loadBudget } from "@/features/budget/data";
import { pageContext } from "@/features/budget/server";

export const metadata: Metadata = { title: "Budget" };

export default async function BudgetRoute() {
  const { db, userId, today } = await pageContext();
  const snapshot = await loadBudget(db, { userId });
  return <BudgetOverview snapshot={snapshot} today={today} />;
}
