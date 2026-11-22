import { describe, expect, it } from "vitest";
import { daysInRange, resolvePeriod } from "../dates";
import * as m from "../metrics";

describe("date rule", () => {
  it.each([
    ["2025-10-27", "2025-10-20", "2025-10-26"], // Monday
    ["2025-10-28", "2025-10-20", "2025-10-26"], // Tuesday
    ["2025-11-02", "2025-10-20", "2025-10-26"], // Sunday: current week not finished
    ["2025-10-26", "2025-10-13", "2025-10-19"], // Sunday
    ["2025-11-03", "2025-10-27", "2025-11-02"], // across a month boundary
    ["2026-01-01", "2025-12-22", "2025-12-28"], // across a year boundary
  ])("last week, today %s -> %s..%s", (today, start, end) => {
    expect(resolvePeriod("last_week", today)).toEqual({ start, end });
  });

  it("last week always spans 7 days, even in a DST week", () => {
    expect(daysInRange(resolvePeriod("last_week", "2025-03-31"))).toBe(7);
  });

  it.each([
    ["2025-10-28", "2025-10-01", "2025-10-28"],
    ["2025-10-01", "2025-10-01", "2025-10-01"], // first of the month
    ["2024-02-29", "2024-02-01", "2024-02-29"], // leap day
  ])("this month, today %s -> %s..%s", (today, start, end) => {
    expect(resolvePeriod("this_month", today)).toEqual({ start, end });
  });

  it("rejects bad input", () => {
    expect(() => resolvePeriod("last_week", "2025-02-30")).toThrow();
    expect(() => m.salesByDay("2025-10-26", "2025-10-20")).toThrow();
    expect(() => m.runMetric("gross_sales", "2025-10-01", "2025-10-02")).toThrow(/Unknown metric/);
  });
});

// Numbers below were checked by hand against data/orders.csv.
describe("metrics, last week (2025-10-20 .. 2025-10-26)", () => {
  const { start: S, end: E } = resolvePeriod("last_week", "2025-10-28");

  it("sales by day covers every day, including days with no orders", () => {
    const days = m.salesByDay(S, E);
    expect(days.map((d) => d.date)).toEqual([
      "2025-10-20", "2025-10-21", "2025-10-22", "2025-10-23", "2025-10-24", "2025-10-25", "2025-10-26",
    ]);
    expect(days[0]).toEqual({ date: "2025-10-20", orders: 0, units: 0, grossSales: 0, discounts: 0, netSales: 0 });
    expect(days[3]).toEqual({ date: "2025-10-23", orders: 1, units: 2, grossSales: 265, discounts: 26.5, netSales: 238.5 });
    expect(days.reduce((a, d) => a + d.grossSales, 0)).toBe(570);
  });

  it("returns are counted on the return date: 4 jackets, $792.15", () => {
    const r = m.returnsByProductAndReason(S, E);
    expect(r.map((g) => [g.title, g.reason, g.units, g.refunded])).toEqual([
      ["Alpine Down Parka", "Defective", 1, 219],
      ["Alpine Down Parka", "Too large", 1, 219],
      ["Alpine Down Parka", "Too small", 1, 219],
      ["Northridge Insulated Jacket", "Too small", 1, 135.15],
    ]);
    expect(r.every((g) => g.category === "Outerwear")).toBe(true);
    // The chino ordered Oct 26 was returned Oct 27, so it is not in last week.
    expect(m.returnsByProductAndReason(S, E, { category: "Bottoms" })).toEqual([]);
  });

  it("repeat customer share", () => {
    expect(m.repeatCustomerShare(S, E)).toEqual({ orders: 4, repeatOrders: 2, share: 0.5 });
  });
});

describe("metrics, this month (2025-10-01 .. 2025-10-28)", () => {
  const { start: S, end: E } = resolvePeriod("this_month", "2025-10-28");

  it("product velocity nets out returns", () => {
    const v = m.productVelocity(S, E);
    expect(v[0]).toMatchObject({ title: "Wool Beanie", netUnits: 4, netUnitsPerDay: 0.143 });
    expect(v.find((p) => p.productId === "P-1001")).toMatchObject({
      title: "Alpine Down Parka", unitsSold: 4, unitsReturned: 3, netUnits: 1, netUnitsPerDay: 0.036,
    });
  });

  it("repeat customer share", () => {
    expect(m.repeatCustomerShare(S, E)).toEqual({ orders: 13, repeatOrders: 5, share: 0.3846 });
  });

  it("whole history: 20 orders, 8 from repeat customers", () => {
    expect(m.repeatCustomerShare("2025-05-01", "2025-10-31")).toEqual({ orders: 20, repeatOrders: 8, share: 0.4 });
    for (const def of m.METRICS) expect(() => m.runMetric(def.name, "2025-05-01", "2025-10-31")).not.toThrow();
  });
});
