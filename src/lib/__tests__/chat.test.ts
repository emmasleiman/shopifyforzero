import { describe, expect, it } from "vitest";
import { buildTools, resolveScope, systemPrompt, TOOL_DESCRIPTIONS } from "../chat";

const TODAY = "2025-10-27";
// Calls a tool's execute directly, the way the model's tool call would.
const call = async (tools: ReturnType<typeof buildTools>, name: string, input: object) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tools[name].execute as any)(input, { toolCallId: "t", messages: [] });

describe("date resolution in tools", () => {
  it("period names are resolved by the server, not the model", () => {
    expect(resolveScope({ period: "last_week" }, TODAY)).toMatchObject({ start: "2025-10-20", end: "2025-10-26" });
    expect(resolveScope({ period: "this_month" }, TODAY)).toMatchObject({ start: "2025-10-01", end: "2025-10-27" });
  });

  it("rejects ranges outside the order history", () => {
    expect(() => resolveScope({ start: "2024-11-28", end: "2024-12-01" }, TODAY)).toThrow(/covers 2025-05-01 to 2025-10-27/);
    expect(() => resolveScope({ start: "2025-10-20", end: "2025-10-30" }, TODAY)).toThrow(/covers/);
  });

  it("maps a product name to its id", () => {
    expect(resolveScope({ period: "last_week", product: "parka" }, TODAY)).toMatchObject({ productId: "P-1001", product: "Alpine Down Parka" });
  });
});

describe("Erik's acceptance cases (tool layer)", () => {
  it("no or vague date -> team default, last 30 days Sep 27–Oct 26", async () => {
    expect(resolveScope({}, TODAY)).toMatchObject({ start: "2025-09-27", end: "2025-10-26", dateSource: "default" });
    const out = await call(buildTools(TODAY), "returns_by_product_and_reason", {});
    expect(out.dates).toEqual({ start: "2025-09-27", end: "2025-10-26", source: "default" });
    expect(out.dateNote).toMatch(/team default/);
    expect(out.result).toHaveLength(5); // Oct 6 Northridge + last week's 4 jackets
  });

  it("'since labor day' with only a start runs through yesterday", () => {
    expect(resolveScope({ start: "2025-09-01" }, TODAY)).toMatchObject({ start: "2025-09-01", end: "2025-10-26" });
  });

  it("channel filter and POS vs online split", async () => {
    const online = await call(buildTools(TODAY), "sales_by_day", { start: "2025-09-27", end: "2025-10-26", channel: "Online Store" });
    expect(online.filters.channel).toBe("Online Store");
    const split = await call(buildTools(TODAY), "sales_by_day", { groupBy: "channel" });
    expect(split.result.map((r: { channel: string }) => r.channel)).toEqual(
      expect.arrayContaining(["Online Store", "Point of Sale", "Shop app"]),
    );
  });

  it("products the store doesn't sell -> empty result with a notice, not an error", async () => {
    const out = await call(buildTools(TODAY), "product_velocity", { start: "2025-08-01", end: "2025-08-31", product: "hoodies" });
    expect(out.error).toBeUndefined();
    expect(out.result).toEqual([]);
    expect(out.notice).toMatch(/No products matching "hoodies"/);
  });

  it("plural product words still match ('beanies and scarves' -> Wool Beanie)", () => {
    expect(resolveScope({ product: "beanies and scarves" }, TODAY)).toMatchObject({ product: "Wool Beanie" });
  });
});

describe("tools", () => {
  it("jackets returned last week -> exact dates and 4 Outerwear returns", async () => {
    const out = await call(buildTools(TODAY), "returns_by_product_and_reason", { period: "last_week", category: "Outerwear" });
    expect(out.dates).toEqual({ start: "2025-10-20", end: "2025-10-26", source: "period" });
    expect(out.result).toHaveLength(4);
  });

  it("only one tool call per question: the second is refused", async () => {
    const tools = buildTools(TODAY);
    await call(tools, "sales_by_day", { period: "last_week" });
    const second = await call(tools, "repeat_customer_share", { period: "last_week" });
    expect(second.error).toMatch(/Only one tool call/);
  });

  it("weekly sales are Monday–Sunday buckets", async () => {
    const out = await call(buildTools(TODAY), "sales_by_day", { start: "2025-10-01", end: "2025-10-26", groupBy: "week" });
    expect(out.result.map((w: { start: string; end: string }) => `${w.start}..${w.end}`)).toEqual([
      "2025-10-01..2025-10-05", "2025-10-06..2025-10-12", "2025-10-13..2025-10-19", "2025-10-20..2025-10-26",
    ]);
    expect(out.result[3].grossSales).toBe(570);
  });

  it("repeat share by month", async () => {
    const out = await call(buildTools(TODAY), "repeat_customer_share", { start: "2025-09-01", end: "2025-10-27", groupBy: "month" });
    expect(out.result.map((m: { start: string; share: number }) => [m.start, m.share])).toEqual([
      ["2025-09-01", 0.5],
      ["2025-10-01", 0.3846],
    ]);
  });
});

describe("prompt and descriptions", () => {
  it("separates products coming back from people coming back", () => {
    expect(TOOL_DESCRIPTIONS.returns_by_product_and_reason).toMatch(/PEOPLE "came back".*repeat_customer_share/);
    expect(TOOL_DESCRIPTIONS.repeat_customer_share).toMatch(/Not for product returns/);
  });

  it("system prompt pins today and spells out last week", () => {
    const p = systemPrompt(TODAY);
    expect(p).toContain("TODAY is Monday 2025-10-27");
    expect(p).toContain("2025-10-20 to 2025-10-26");
    expect(p).toMatch(/ROAS/);
  });
});
