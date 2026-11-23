import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { buildTools, markupToolName, resolveScope } from "../chat";
import { chatStream } from "../chatStream";

const TODAY = "2025-10-27";
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = (unified: string) => ({ type: "finish", finishReason: { unified, raw: unified }, usage });
const textParts = (text: string) => [
  { type: "text-start", id: "1" },
  ...text.match(/.{1,4}/gs)!.map((delta) => ({ type: "text-delta", id: "1", delta })),
  { type: "text-end", id: "1" },
];

/** A fake model that plays back one scripted reply per call. */
function scripted(replies: object[][]) {
  let n = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...replies[n++]] as never[] }),
    }),
  });
}

async function run(replies: object[][]) {
  const model = scripted(replies);
  const calls: string[] = [];
  const settings = {
    model,
    system: "test",
    tools: buildTools(TODAY, (name) => calls.push(name)),
    stopWhen: () => false,
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === 0 ? {} : { activeTools: [] as never[], toolChoice: "none" as const },
    temperature: 0,
  };
  const chunks: { type: string; delta?: string }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const c of chatStream(settings as any, [{ role: "user", content: "how are returns doing" }])) chunks.push(c);
  const text = chunks.filter((c) => c.type === "text-delta").map((c) => c.delta).join("");
  return { chunks, text, calls, modelCalls: model.doStreamCalls };
}

describe("tool-call markup written as text (seen live on AQ-02 and AQ-08)", () => {
  it("finds the tool the model meant", () => {
    const tools = ["product_velocity", "returns_by_product_and_reason"];
    expect(markupToolName("<tool_call>\n<function=product_velocity>\n</function>\n</tool_call>", tools)).toBe("product_velocity");
    expect(markupToolName("<tool_call><function=hack></function></tool_call>", tools)).toBeUndefined();
    expect(markupToolName("Sales were $120.", tools)).toBeUndefined();
  });

  it("hides the markup and retries once with that tool forced", async () => {
    const markup = "<tool_call>\n<function=returns_by_product_and_reason>\n</function>\n</tool_call>";
    const r = await run([
      [...textParts(markup), finish("stop")],
      [{ type: "tool-call", toolCallId: "t1", toolName: "returns_by_product_and_reason", input: "{}" }, finish("tool-calls")],
      [...textParts("Sep 27-Oct 26, 2025: 5 items came back."), finish("stop")],
    ]);
    expect(r.text).not.toContain("<tool_call");
    expect(r.text).toContain("5 items came back");
    expect(r.calls).toEqual(["returns_by_product_and_reason"]);
    expect(r.modelCalls[1].toolChoice).toEqual({ type: "tool", toolName: "returns_by_product_and_reason" });
    expect(r.chunks.filter((c) => c.type === "start")).toHaveLength(1);
    expect(r.chunks.filter((c) => c.type === "finish")).toHaveLength(1);
  });

  it("leaves normal answers alone (no tool, no retry)", async () => {
    const r = await run([[...textParts("We don't have ad spend data."), finish("stop")]]);
    expect(r.text).toBe("We don't have ad spend data.");
    expect(r.modelCalls).toHaveLength(1);
    expect(r.chunks.filter((c) => c.type === "finish")).toHaveLength(1);
  });

  it("short text that starts like markup still shows", async () => {
    const r = await run([[...textParts("<3"), finish("stop")]]);
    expect(r.text).toBe("<3");
  });
});

describe("category words name a category, not one product (seen live on AQ-03)", () => {
  it('"jackets" is all Outerwear, not just the Northridge Insulated Jacket', () => {
    const s = resolveScope({ period: "last_week", product: "jackets" }, TODAY);
    expect(s).toMatchObject({ category: "Outerwear", productId: undefined, product: undefined });
  });
  it("a named product stays a product", () => {
    expect(resolveScope({ product: "Northridge jacket" }, TODAY).product).toBe("Northridge Insulated Jacket");
    expect(resolveScope({ product: "beanies" }, TODAY).product).toBe("Wool Beanie");
    expect(resolveScope({ product: "sweaters" }, TODAY).product).toBe("Merino Crew Sweater");
  });
});
