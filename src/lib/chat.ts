/**
 * Everything the chat model sees: the four metric tools (described in the
 * words merchants actually type), the system prompt with the date rule, and
 * the one-question-one-tool-call settings. Shared by /api/chat and
 * scripts/check-questions.ts so both behave identically.
 */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  addDays, assertRange, DATA_START, resolvePeriod, splitRange, startOfWeek, storeToday, weekday,
  type DateRange,
} from "./dates";
import { productVelocity, repeatCustomerShare, returnsByProductAndReason, salesByDay } from "./metrics";
import { loadOrders } from "./orders";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Knitwear", "Accessories"] as const;

// ------------------------------------------------------------ shared input + date resolution

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const baseInput = {
  period: z
    .enum(["last_week", "this_month"])
    .optional()
    .describe('Use for "last week" / "last wk" or "this month". The server turns it into exact dates. Leave start/end empty when set.'),
  start: isoDate.optional().describe("First day, inclusive, YYYY-MM-DD. Use for every other date phrase."),
  end: isoDate.optional().describe("Last day, inclusive, YYYY-MM-DD."),
  category: z
    .enum(CATEGORIES)
    .optional()
    .describe("Jackets, coats, parkas, puffers, shells = Outerwear. Sweaters, cardigans = Knitwear. Jeans, chinos, pants = Bottoms. Tees, shirts = Tops. Beanies, gloves, hats = Accessories."),
  product: z.string().optional().describe('Part of a product title, e.g. "parka", when the merchant names one product.'),
};

export interface ResolvedScope extends DateRange {
  category?: string;
  productId?: string;
  product?: string;
}

/** Turns tool input into exact dates + filters, or throws a message the model can relay. */
export function resolveScope(
  input: { period?: "last_week" | "this_month"; start?: string; end?: string; category?: string; product?: string },
  today: string,
): ResolvedScope {
  const range = input.period
    ? resolvePeriod(input.period, today)
    : input.start && input.end
      ? { start: input.start, end: input.end }
      : (() => { throw new Error("Give either period, or both start and end."); })();
  assertRange(range.start, range.end);
  if (range.start < DATA_START || range.end > today) {
    throw new Error(`No data for ${range.start}..${range.end}. Order history covers ${DATA_START} to ${today} only.`);
  }
  let productId: string | undefined;
  let product: string | undefined;
  if (input.product) {
    const hit = loadOrders().find((l) => l.productTitle.toLowerCase().includes(input.product!.toLowerCase()));
    if (!hit) throw new Error(`No product matching "${input.product}".`);
    productId = hit.productId;
    product = hit.productTitle;
  }
  return { ...range, category: input.category, productId, product };
}

// ------------------------------------------------------------ the four tools

export const TOOL_DESCRIPTIONS = {
  sales_by_day:
    'Sales over time. Use for: "sales", "revenue", "how much did we sell", "sales per day", "sales by week", ' +
    '"weekly revenue", "revenue last month", "sales trend", "is it slowing", "what\'s going on with sales". ' +
    "Returns orders, units, gross sales, discounts and net sales (gross − discounts) per day, or per week/month " +
    "with groupBy. Counted on the ORDER date. Not for returns or for ranking products.",
  product_velocity:
    'Best-sellers and reorders. Use for: "best seller", "top products", "top 10 products", "what sold best", ' +
    '"top sellers by units", "what should I reorder", "what to restock before BFCM / Black Friday". ' +
    "Per product: units sold, units returned, net units kept and net units per day, highest first. " +
    "Counted on the ORDER date. It ranks by units, not revenue.",
  returns_by_product_and_reason:
    'Products that came BACK. Use for: "returns", "returned", "returnd", "came back as returns", "coming back", ' +
    '"most returned", "returns by product / category", "is it a sizing thing", "why are people returning". ' +
    "Groups returns by product and reason with units and refunded dollars. Counted on the RETURN date, " +
    'so "returns last week" means items returned last week. ' +
    'If PEOPLE "came back" (bought again), use repeat_customer_share instead.',
  repeat_customer_share:
    'CUSTOMERS who came back to buy again. Use for: "repeat customers", "returning customers", ' +
    '"% of orders from returning customers", "ordering a 2nd time", "came back twice", "are repeat customers ' +
    'growing", "loyalty". Share of orders from customers who had ordered before. Counted on the ORDER date. ' +
    "Use groupBy week or month to see a trend. Not for product returns.",
} as const;

/**
 * Builds the tool set for one request. `onCall` lets the caller log calls;
 * the guard refuses any call after the first, so one question = one tool call.
 */
export function buildTools(today: string, onCall?: (name: string, scope: ResolvedScope, input: unknown) => void): ToolSet {
  let used = false;
  const run = <T>(name: string, input: Parameters<typeof resolveScope>[0], fn: (s: ResolvedScope) => T) => {
    if (used) return { error: "Only one tool call is allowed per question. Answer with the result you already have." };
    used = true;
    try {
      const scope = resolveScope(input, today);
      onCall?.(name, scope, input);
      const filters = { category: scope.category, productId: scope.productId };
      return { dates: { start: scope.start, end: scope.end }, filters: { category: scope.category, product: scope.product }, result: fn({ ...scope, ...filters }) };
    } catch (e) {
      onCall?.(name, { start: "", end: "" }, input);
      return { error: (e as Error).message };
    }
  };
  const opts = (s: ResolvedScope) => ({ category: s.category, productId: s.productId });

  return {
    sales_by_day: tool({
      description: TOOL_DESCRIPTIONS.sales_by_day,
      inputSchema: z.object({ ...baseInput, groupBy: z.enum(["day", "week", "month"]).optional().describe('"week" for weekly sales, "month" for monthly. Default day.') }),
      execute: async (i) =>
        run("sales_by_day", i, (s) => {
          const days = salesByDay(s.start, s.end, opts(s));
          if (!i.groupBy || i.groupBy === "day") return days;
          return splitRange(s.start, s.end, i.groupBy).map((r) => {
            const inR = days.filter((d) => d.date >= r.start && d.date <= r.end);
            const t = (k: "orders" | "units" | "grossSales" | "discounts" | "netSales") =>
              Math.round(inR.reduce((a, d) => a + d[k], 0) * 100) / 100;
            return { start: r.start, end: r.end, orders: t("orders"), units: t("units"), grossSales: t("grossSales"), discounts: t("discounts"), netSales: t("netSales") };
          });
        }),
    }),
    product_velocity: tool({
      description: TOOL_DESCRIPTIONS.product_velocity,
      inputSchema: z.object(baseInput),
      execute: async (i) => run("product_velocity", i, (s) => productVelocity(s.start, s.end, opts(s))),
    }),
    returns_by_product_and_reason: tool({
      description: TOOL_DESCRIPTIONS.returns_by_product_and_reason,
      inputSchema: z.object(baseInput),
      execute: async (i) => run("returns_by_product_and_reason", i, (s) => returnsByProductAndReason(s.start, s.end, opts(s))),
    }),
    repeat_customer_share: tool({
      description: TOOL_DESCRIPTIONS.repeat_customer_share,
      inputSchema: z.object({ ...baseInput, groupBy: z.enum(["week", "month"]).optional().describe("Split the range to show a trend.") }),
      execute: async (i) =>
        run("repeat_customer_share", i, (s) =>
          i.groupBy
            ? splitRange(s.start, s.end, i.groupBy).map((r) => ({ ...r, ...repeatCustomerShare(r.start, r.end, opts(s)) }))
            : repeatCustomerShare(s.start, s.end, opts(s)),
        ),
    }),
  };
}

// ------------------------------------------------------------ system prompt

export function systemPrompt(today: string): string {
  const lastWeek = resolvePeriod("last_week", today);
  const thisMonth = resolvePeriod("this_month", today);
  return `You answer a Shopify merchant's questions about their own store using exactly one metric tool.

TODAY is ${weekday(today)} ${today} (store time zone). Never use any other date as today.

DATE RULE (all dates are calendar dates, both ends included):
- "last week", "last wk" -> period "last_week" (most recent complete Monday-Sunday week = ${lastWeek.start} to ${lastWeek.end}).
- "this month" -> period "this_month" (1st of the month to today = ${thisMonth.start} to ${thisMonth.end}).
- Anything else -> pass exact start and end yourself. Anchors: yesterday = ${addDays(today, -1)}; last Sunday = ${addDays(startOfWeek(today), -1)};
  this week started ${startOfWeek(today)}; "last N days" = the N days ending yesterday; "last month" = the previous full calendar month;
  "since <month>" = 1st of that month to today; "this season" / "since summer" = from 2025-06-01 unless the merchant says otherwise.
- Returns are counted on the RETURN date; everything else on the ORDER date.
- Order history covers ${DATA_START} to ${today} only.

RULES:
1. Make exactly ONE tool call per question, then answer. Never call a second tool.
2. Products that "came back" = returns. People/customers who "came back" = repeat customers.
3. Read through typos and shorthand ("jakets returnd last wk" = jackets returned last week).
4. If the question needs data we don't have, do NOT call a tool. Say what's missing in one sentence:
   ad spend, ROAS, campaigns, marketing costs, inventory/stock levels, forecasts, or any date before ${DATA_START}
   (e.g. last year's Black Friday, January).
5. If a question needs two metrics (e.g. sales AND returns), answer the main one and say which other question to ask next.
6. Start the answer with the exact dates used, e.g. "Oct 20-26, 2025:". Use only numbers from the tool result; never invent or estimate.
7. Keep it short: a sentence or two, then a compact list or table if useful. If the tool returns an error, relay it plainly.`;
}

// ------------------------------------------------------------ model + call settings

export function chatSettings(opts: { today?: string; onCall?: Parameters<typeof buildTools>[1] } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set. Add it to .env.local (see .env.example).");
  const today = opts.today ?? storeToday();
  const openrouter = createOpenRouter({ apiKey });
  return {
    model: openrouter.chat(process.env.OPENROUTER_MODEL || DEFAULT_MODEL, { parallelToolCalls: false }),
    system: systemPrompt(today),
    tools: buildTools(today, opts.onCall),
    // Step 1: the model may call one tool. Step 2: tools are switched off, so it can only answer.
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === 0 ? {} : { activeTools: [] as never[], toolChoice: "none" as const },
    temperature: 0,
  };
}
