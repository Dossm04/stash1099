import { describe, expect, it } from "vitest";
import { PLANS, checkedInThisWeek, checkinStreak, daysToFriday, pricePerDay, weekStart } from "./pro";
import { quotePayout } from "./quote";
import { MAYA_STATE } from "./state";

describe("weekly payday ritual", () => {
  it("weeks start on Monday", () => {
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week of Mon Nov 9
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });

  it("counts consecutive weeks with a check-in", () => {
    const checkins = ["2026-10-30", "2026-11-06", "2026-11-13"];
    expect(checkinStreak(checkins, "2026-11-15")).toBe(3);
    expect(checkedInThisWeek(checkins, "2026-11-15")).toBe(true);
  });

  it("keeps the streak alive until the end of the next week, then resets", () => {
    const checkins = ["2026-10-30", "2026-11-06"];
    expect(checkinStreak(checkins, "2026-11-12")).toBe(2); // this week not done yet
    expect(checkinStreak(checkins, "2026-11-20")).toBe(0); // a whole week was skipped
  });

  it("several check-ins in one week count once", () => {
    expect(checkinStreak(["2026-11-10", "2026-11-11", "2026-11-13"], "2026-11-15")).toBe(1);
  });

  it("knows how far Friday is", () => {
    expect(daysToFriday("2026-11-13")).toBe(0); // Friday
    expect(daysToFriday("2026-11-15")).toBe(5); // Sunday → next Friday
    expect(daysToFriday("2026-11-16")).toBe(4); // Monday
  });
});

describe("plans", () => {
  it("longer plans cost less per day", () => {
    const perDay = PLANS.map(pricePerDay);
    expect(perDay).toEqual([...perDay].sort((a, b) => b - a));
    expect(pricePerDay(PLANS[1])).toBe(0.71);
  });
});

describe("pay stub", () => {
  it("lines always add up to the payout", () => {
    for (const amount of [37, 412.75, 1_200, 9_999]) {
      const s = quotePayout(MAYA_STATE, amount, "2026-11-15");
      expect(s.selfEmployment + s.federalIncome + s.state).toBe(s.stash);
      expect(s.stash + s.yours).toBe(s.gross);
    }
  });

  it("splits Maya's $1,200 into SE tax $170 and federal income tax $107", () => {
    expect(quotePayout(MAYA_STATE, 1_200, "2026-11-15")).toEqual({
      gross: 1_200,
      selfEmployment: 170,
      federalIncome: 107,
      state: 0,
      stash: 277,
      yours: 923,
    });
  });

  it("adds a state line when the state taxes income", () => {
    const s = quotePayout({ ...MAYA_STATE, stateRate: 0.05 }, 1_200, "2026-11-15");
    expect(s.state).toBeGreaterThan(40);
    expect(s.stash).toBeGreaterThan(300);
  });
});
