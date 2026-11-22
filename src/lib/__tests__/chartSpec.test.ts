import { describe, expect, it } from "vitest";
import { buildTools } from "../chat";
import { chartSpec, formatRange, CHART_FOR_TOOL } from "../chartSpec";

const TODAY = "2025-10-27";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = async (name: string, input: object) => (buildTools(TODAY)[name].execute as any)(input, { toolCallId: "t", messages: [] });

describe("formatRange", () => {
  it.each([
    ["2025-10-20", "2025-10-26", "Oct 20–26, 2025"],
    ["2025-09-01", "2025-10-26", "Sep 1 – Oct 26, 2025"],
    ["2025-10-27", "2025-10-27", "Oct 27, 2025"],
  ])("%s..%s -> %s", (s, e, want) => expect(formatRange(s, e)).toBe(want));
});

describe("chart picked from the tool result", () => {
  it("returns -> table with exact-date title and a total row", async () => {
    const spec = chartSpec("returns_by_product_and_reason", await run("returns_by_product_and_reason", { period: "last_week", category: "Outerwear" }));
    expect(spec).toMatchObject({ kind: "table", title: "Returns · Oct 20–26, 2025 · Outerwear", total: { units: 4, refunded: 792.15 } });
  });

  it("sales -> line, zero days kept", async () => {
    const spec = chartSpec("sales_by_day", await run("sales_by_day", { period: "last_week" }));
    expect(spec?.kind).toBe("line");
    if (spec?.kind === "line") {
      expect(spec.points).toHaveLength(7);
      expect(spec.points[0]).toMatchObject({ label: "Oct 20", netSales: 0 });
    }
  });

  it("velocity -> bars sorted by net units per day, so the parka is not a winner", async () => {
    const spec = chartSpec("product_velocity", await run("product_velocity", { period: "this_month" }));
    expect(spec?.kind).toBe("bar");
    if (spec?.kind === "bar") {
      expect(spec.rows[0].title).toBe("Wool Beanie");
      const parka = spec.rows.findIndex((r) => r.title === "Alpine Down Parka");
      expect(parka).toBeGreaterThan(spec.rows.findIndex((r) => r.title === "Northridge Insulated Jacket"));
    }
  });

  it("repeat share -> card with counts; grouped -> trend", async () => {
    expect(chartSpec("repeat_customer_share", await run("repeat_customer_share", { period: "last_week" }))).toMatchObject({
      kind: "card", value: { share: 0.5, repeatOrders: 2, orders: 4 },
    });
    expect(chartSpec("repeat_customer_share", await run("repeat_customer_share", { start: "2025-05-01", end: "2025-10-27", groupBy: "month" }))?.kind).toBe("card-trend");
  });

  it("no chart for errors, unknown tools or missing output", async () => {
    expect(chartSpec("sales_by_day", await run("sales_by_day", { start: "2024-11-01", end: "2024-11-30" }))).toBeNull();
    expect(chartSpec("ad_spend", { result: [] })).toBeNull();
    expect(chartSpec("sales_by_day", undefined)).toBeNull();
  });

  it("'No orders in this range' instead of an empty chart", async () => {
    const spec = chartSpec("sales_by_day", await run("sales_by_day", { start: "2025-05-07", end: "2025-05-20" }));
    expect(spec).toMatchObject({ kind: "empty", message: "No orders in this range" });
    expect(chartSpec("returns_by_product_and_reason", await run("returns_by_product_and_reason", { start: "2025-05-07", end: "2025-05-20" }))).toMatchObject({ kind: "empty" });
  });

  it("every tool has a skeleton shape", () => {
    expect(CHART_FOR_TOOL).toEqual({ sales_by_day: "line", product_velocity: "bar", returns_by_product_and_reason: "table", repeat_customer_share: "card" });
  });
});
