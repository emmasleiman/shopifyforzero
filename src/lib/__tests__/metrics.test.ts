import { describe, expect, it } from "vitest";
import { resolvePeriod, daysInRange } from "../dates";
import * as m from "../metrics";

describe("last-week rule (Monday–Sunday, most recent complete week)", () => {
  it.each([
    ["2025-10-27", "2025-10-20", "2025-10-26"], // Monday
    ["2025-10-28", "2025-10-20", "2025-10-26"], // Tuesday
    ["2025-11-02", "2025-10-20", "2025-10-26"], // Sunday: current week not finished
    ["2025-10-26", "2025-10-13", "2025-10-19"], // Sunday
    ["2026-01-01", "2025-12-22", "2025-12-28"], // across a year boundary
    ["2025-11-03", "2025-10-27", "2025-11-02"], // across a month boundary
  ])("today %s -> %s..%s", (today, start, end) => {
    expect(resolvePeriod("last_week", today)).toEqual({ start, end });
  });

  it("always spans exactly 7 days", () => {
    expect(daysInRange(resolvePeriod("last_week", "2025-03-31"))).toBe(7); // DST week in many zones
  });

  it("other periods", () => {
    expect(resolvePeriod("last_7_days", "2025-10-28")).toEqual({ start: "2025-10-21", end: "2025-10-27" });
    expect(resolvePeriod("last_month", "2025-10-28")).toEqual({ start: "2025-09-01", end: "2025-09-30" });
    expect(resolvePeriod("this_week", "2025-10-28")).toEqual({ start: "2025-10-27", end: "2025-10-28" });
  });

  it("rejects bad input", () => {
    expect(() => resolvePeriod("last_week", "2025-02-30")).toThrow();
    expect(() => m.grossSales("2025-10-26", "2025-10-20")).toThrow();
  });
});

// Hand-checked against data/orders.csv for last week, 2025-10-20 .. 2025-10-26.
describe("metrics for last week (2025-10-20 .. 2025-10-26)", () => {
  const S = "2025-10-20";
  const E = "2025-10-26";

  it("sales", () => {
    expect(m.grossSales(S, E)).toBe(570);
    expect(m.discounts(S, E)).toBe(26.5);
    expect(m.orderCount(S, E)).toBe(4);
    expect(m.unitsSold(S, E)).toBe(7);
    expect(m.averageOrderValue(S, E)).toBe(135.88);
    expect(m.repeatCustomerRate(S, E)).toBe(0.5);
    // Refunds processed last week exceed what was sold: 570 - 26.50 - 792.15
    expect(m.netSales(S, E)).toBe(-248.65);
  });

  it("jacket (Outerwear) returns are keyed on return date", () => {
    expect(m.returns(S, E)).toEqual({ lineItems: 4, units: 4, refunded: 792.15 });
    expect(m.returns(S, E, { category: "outerwear" })).toEqual({ lineItems: 4, units: 4, refunded: 792.15 });
    // The chino ordered Oct 26 was returned Oct 27 -> not in last week's returns.
    expect(m.returns(S, E, { category: "Bottoms" }).lineItems).toBe(0);
    expect(m.returnsByReason(S, E, { category: "Outerwear" }).map((r) => [r.reason, r.units])).toEqual([
      ["Too small", 2],
      ["Defective", 1],
      ["Too large", 1],
    ]);
  });

  it("fulfillment and channels", () => {
    expect(m.unfulfilledItems(S, E)).toEqual({ lineItems: 2, units: 2, orders: 2 });
    expect(m.salesByChannel(S, E)[0]).toEqual({ channel: "Online Store", orders: 2, sales: 397.5 });
  });

  it("every registered metric runs over the whole history", () => {
    for (const def of m.METRICS) expect(() => m.runMetric(def.name, "2025-05-01", "2025-10-31")).not.toThrow();
    expect(m.orderCount("2025-05-01", "2025-10-31")).toBe(20);
    expect(m.unitsSold("2025-05-01", "2025-10-31")).toBe(33);
  });

  it("product velocity for Outerwear in October", () => {
    const v = m.productVelocity("2025-10-01", "2025-10-31", { category: "Outerwear" });
    const parka = v.find((p) => p.productId === "P-1001")!;
    expect(parka).toMatchObject({ unitsSold: 4, unitsReturned: 3, netUnits: 1 });
  });
});
