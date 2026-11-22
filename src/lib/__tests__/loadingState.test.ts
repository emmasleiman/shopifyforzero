import { describe, expect, it } from "vitest";
import { buildTools } from "../chat";
import { partView } from "../loadingState";

const TODAY = "2025-10-27";

describe("loading state follows the tool part's state", () => {
  it("input-streaming with no input yet -> skeleton in the chart's shape", () => {
    expect(partView("returns_by_product_and_reason", "input-streaming", undefined, undefined, TODAY)).toEqual({
      show: "skeleton", kind: "table", caption: "Checking returns…",
    });
  });

  it("input-available -> skeleton with exact dates in the caption", () => {
    expect(partView("returns_by_product_and_reason", "input-available", { period: "last_week", category: "Outerwear" }, undefined, TODAY)).toEqual({
      show: "skeleton", kind: "table", caption: "Checking returns for Oct 20–26, 2025 · Outerwear…",
    });
    expect(partView("sales_by_day", "input-available", { start: "2025-10-13", end: "2025-10-26" }, undefined, TODAY)).toMatchObject({
      kind: "line", caption: "Checking sales for Oct 13–26, 2025…",
    });
  });

  it("each tool's skeleton matches its chart", () => {
    const kinds = ["sales_by_day", "product_velocity", "returns_by_product_and_reason", "repeat_customer_share"].map(
      (t) => (partView(t, "input-streaming", {}, undefined, TODAY) as { kind: string }).kind,
    );
    expect(kinds).toEqual(["line", "bar", "table", "card"]);
  });

  it("partial dates while streaming don't crash the caption", () => {
    expect(partView("sales_by_day", "input-streaming", { start: "2025-10-1" }, undefined, TODAY)).toMatchObject({ caption: "Checking sales…" });
  });

  it("output-available -> real chart", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (buildTools(TODAY).repeat_customer_share.execute as any)({ period: "last_week" }, { toolCallId: "t", messages: [] });
    expect(partView("repeat_customer_share", "output-available", {}, out, TODAY)).toMatchObject({ show: "chart", spec: { kind: "card" } });
  });

  it("errors and unknown tools -> text only", () => {
    expect(partView("sales_by_day", "output-error", {}, undefined, TODAY)).toEqual({ show: "nothing" });
    expect(partView("sales_by_day", "output-available", {}, { error: "No data" }, TODAY)).toEqual({ show: "nothing" });
    expect(partView("ad_spend", "input-streaming", {}, undefined, TODAY)).toEqual({ show: "nothing" });
  });
});
