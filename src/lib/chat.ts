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
import { productVelocity, repeatCustomerShare, returnsByProductAndReason, salesByChannel, salesByDay } from "./metrics";
import { loadOrders } from "./orders";

/** Free OpenRouter model that supports tool calling (see README: "Model choice"). */
export const DEFAULT_MODEL = "nvidia/nemotron-3.5-super-vl:free";
const CATEGORIES = ["Outerwear", "Tops", "Bottoms", "Knitwear", "Accessories"] as const;

// ------------------------------------------------------------ shared input + date resolution

/** Days covered by the team default range, used when a question gives no date or a vague one. */
export const DEFAULT_RANGE_DAYS = 30;
const CHANNELS = ["Online Store", "Point of Sale", "Shop app", "Instagram"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
/**
 * Some models send "" (or null) for a field they mean to leave out, e.g. {"period":"","start":""}
 * for a question with no date. Treat that as "not given" instead of rejecting the call.
 */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
const baseInput = {
  period: blank(z.enum(["last_week", "this_month"])).describe('Use for "last week" / "last wk" or "this month". The server turns it into exact dates. Leave start/end empty when set.'),
  start: blank(isoDate).describe("First day, inclusive, YYYY-MM-DD, for a specific date phrase. Leave empty when the question has no date or a vague one."),
  end: blank(isoDate).describe("Last day, inclusive, YYYY-MM-DD."),
  category: blank(z.enum(CATEGORIES)).describe("Jackets, coats, parkas, puffers, shells = Outerwear. Sweaters, cardigans = Knitwear. Jeans, chinos, pants = Bottoms. Tees, shirts = Tops. Beanies, gloves, hats = Accessories."),
  product: blank(z.string()).describe('A product word the merchant names that is not a category above, e.g. "parka", "hoodie", "boots".'),
  channel: blank(z.enum(CHANNELS)).describe('Sales channel: "online store only" = Online Store; "POS", "in store", "retail" = Point of Sale; "Shop app"; "Instagram".'),
};

export interface ResolvedScope extends DateRange {
  dateSource?: "period" | "explicit" | "default";
  category?: string;
  channel?: string;
  productId?: string;
  product?: string;
  /** Set when a named product isn't sold here: the chart shows this instead of data. */
  notice?: string;
}

/** Team default: the last 30 days ending yesterday (2025-09-27..2025-10-26 when today is 2025-10-27). */
export function defaultRange(today: string): DateRange {
  return { start: addDays(today, -DEFAULT_RANGE_DAYS), end: addDays(today, -1) };
}

const NO_MATCH = "__no_match__";
const STOP_WORDS = new Set(["the", "our", "all", "any"]);
/**
 * Generic words for a whole category (after stem()). Words that are part of one
 * product's title (sweater, shirt, jeans, beanie) stay product filters.
 */
const CATEGORY_WORDS: Record<string, (typeof CATEGORIES)[number]> = {
  jacket: "Outerwear", coat: "Outerwear", puffer: "Outerwear", outerwear: "Outerwear",
  knitwear: "Knitwear", knit: "Knitwear",
  top: "Tops", bottom: "Bottoms", pant: "Bottoms", trouser: "Bottoms",
  accessorie: "Accessories", accessory: "Accessories",
};

/**
 * Some free models (Nemotron) sometimes write their native tool-call markup as
 * text instead of making a real tool call, usually when the call has no
 * arguments. Returns the tool it meant, so the route can retry with that tool forced.
 */
export function markupToolName(text: string, toolNames: string[]): string | undefined {
  // Formats seen: <function=NAME>, {"name": "NAME", ...}, or just the tool name inside <tool_call>.
  const named = /<function=([\w-]+)>/.exec(text)?.[1] ?? /"name"\s*:\s*"([\w-]+)"/.exec(text)?.[1];
  if (named && toolNames.includes(named)) return named;
  return toolNames.find((t) => text.includes(t));
}
const stem = (w: string) => w.toLowerCase().replace(/(ies)$/, "ie").replace(/(es|s)$/, "");

/** Turns tool input into exact dates + filters, or throws a message the model can relay. */
export function resolveScope(
  input: { period?: "last_week" | "this_month"; start?: string; end?: string; category?: string; product?: string; channel?: string },
  today: string,
): ResolvedScope {
  let range: DateRange;
  let dateSource: ResolvedScope["dateSource"];
  if (input.period) {
    range = resolvePeriod(input.period, today);
    dateSource = "period";
  } else if (input.start) {
    range = { start: input.start, end: input.end ?? addDays(today, -1) };
    dateSource = "explicit";
  } else {
    range = defaultRange(today);
    dateSource = "default";
  }
  assertRange(range.start, range.end);
  if (range.start < DATA_START || range.end > today) {
    throw new Error(`No data for ${range.start}..${range.end}. Order history covers ${DATA_START} to ${today} only.`);
  }

  let productId: string | undefined;
  let product: string | undefined;
  let notice: string | undefined;
  let category = input.category;
  // "jackets" / "coats" name a whole category, not the one product with "Jacket" in its title.
  const words = input.product?.split(/[\s,/&]+|\band\b/i).map(stem).filter((w) => w.length > 2 && !STOP_WORDS.has(w)) ?? [];
  const categoryWord =
    words.length > 0 && words.every((w) => CATEGORY_WORDS[w] && CATEGORY_WORDS[w] === CATEGORY_WORDS[words[0]])
      ? CATEGORY_WORDS[words[0]]
      : undefined;
  if (categoryWord && !category) category = categoryWord;
  if (input.product && !categoryWord) {
    const want = words;
    const hit = loadOrders().find((l) => want.some((w) => l.productTitle.toLowerCase().includes(w)));
    if (hit) {
      productId = hit.productId;
      product = hit.productTitle;
    } else {
      const titles = [...new Set(loadOrders().map((l) => l.productTitle))].join(", ");
      productId = NO_MATCH;
      product = input.product;
      notice = `No products matching "${input.product}". This store sells: ${titles}.`;
    }
  }
  return { ...range, dateSource, category, channel: input.channel, productId, product, notice };
}

// ------------------------------------------------------------ the four tools

export const TOOL_DESCRIPTIONS = {
  sales_by_day:
    'Sales over time. Use for: "sales", "revenue", "how much did we sell", "sales per day", "sales by week", ' +
    '"weekly revenue", "revenue last month", "sales trend", "is it slowing", "what\'s going on with sales". ' +
    "Returns orders, units, gross sales, discounts and net sales (gross − discounts) per day, or per week/month " +
    "with groupBy, or split by channel (\"online vs POS\", \"online store only\") with groupBy channel / the channel filter. " +
    "Counted on the ORDER date. Not for returns or for ranking products.",
  product_velocity:
    'Best-sellers and reorders. Use for: "best seller", "top products", "top 10 products", "what sold best", ' +
    '"top sellers by units", "what\'s selling", "what sells best", "what should I reorder", ' +
    '"what to restock before BFCM / Black Friday". Not for stock on hand. ' +
    "Per product: units sold, units returned, net units kept and net units per day, highest first. " +
    "Counted on the ORDER date. It ranks by units, not revenue.",
  returns_by_product_and_reason:
    'Products that came BACK. Use for: "returns", "returned", "returnd", "came back as returns", "coming back", ' +
    '"most returned", "returns by product / category", "return rate", "refunds", "return reasons", "is it a sizing thing", ' +
    '"why are people returning". ' +
    "Groups returns by product and reason with units and refunded dollars. Counted on the RETURN date, " +
    'so "returns last week" means items returned last week. ' +
    'If PEOPLE "came back" (bought again), use repeat_customer_share instead.',
  repeat_customer_share:
    'CUSTOMERS who came back to buy again. Use for: "repeat customers", "returning customers", ' +
    '"% of orders from returning customers", "ordering a 2nd time", "came back twice", "bought twice", "repeat buyers", "are repeat customers ' +
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
      return {
        dates: { start: scope.start, end: scope.end, source: scope.dateSource },
        filters: { category: scope.category, product: scope.product, channel: scope.channel },
        ...(scope.dateSource === "default" && {
          dateNote: `No specific dates given, so the team default range (last ${DEFAULT_RANGE_DAYS} days) was used. Say so.`,
        }),
        ...(scope.notice && { notice: scope.notice }),
        result: fn(scope),
      };
    } catch (e) {
      onCall?.(name, { start: "", end: "" }, input);
      return {
        error: (e as Error).message,
        instruction: "Tell the merchant this in one or two plain sentences. Do not call another tool and do not output tool-call markup.",
      };
    }
  };
  const opts = (s: ResolvedScope) => ({ category: s.category, productId: s.productId, channel: s.channel });

  return {
    sales_by_day: tool({
      description: TOOL_DESCRIPTIONS.sales_by_day,
      inputSchema: z.object({ ...baseInput, groupBy: blank(z.enum(["day", "week", "month", "channel"])).describe('"week" for weekly sales, "month" for monthly, "channel" for a split by sales channel (e.g. "POS vs online"). Default day.') }),
      execute: async (i) =>
        run("sales_by_day", i, (s) => {
          if (i.groupBy === "channel") return salesByChannel(s.start, s.end, opts(s));
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
      inputSchema: z.object({ ...baseInput, groupBy: blank(z.enum(["week", "month"])).describe("Split the range to show a trend.") }),
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
- A SPECIFIC date phrase -> pass exact start and end yourself. Anchors: yesterday = ${addDays(today, -1)}; last Sunday = ${addDays(startOfWeek(today), -1)};
  this week started ${startOfWeek(today)}; "last N days" = the N days ending yesterday; "last month" = the previous full calendar month;
  "in <month>" = that whole month (the current month runs to today); "since <date or holiday>" = that day through yesterday
  (Labor Day 2025 = 2025-09-01).
- NO date, or a VAGUE one ("lately", "recently", "rn", "right now", "this season", "since summer", "how are X doing"):
  leave period, start and end EMPTY. The server applies the team default: the last ${DEFAULT_RANGE_DAYS} days,
  ${defaultRange(today).start} to ${defaultRange(today).end}. Still call the tool.
- Returns are counted on the RETURN date; everything else on the ORDER date.
- Order history covers ${DATA_START} to ${today} only.

RULES:
1. Make exactly ONE tool call per question, then answer. Never call a second tool.
2. Products that "came back" = returns. People/customers who "came back" = repeat customers.
3. Read through typos and shorthand ("jakets returnd last wk" = jackets returned last week).
4. If the question needs data we don't have, do NOT call a tool. Say what's missing in one sentence:
   ad spend (Meta, Google, Instagram ads), ROAS, campaigns, marketing costs, inventory / stock left, forecasts, or any date before ${DATA_START}
   (e.g. last year's Black Friday, January).
5. If a question needs two metrics (e.g. sales AND returns), answer the main one and say which other question to ask next.
6. Start the answer with the exact dates used, e.g. "Oct 20-26, 2025:". If the result has a dateNote, say the team default range was used.
   If it has a notice (e.g. no matching products), say that plainly. Use only numbers from the tool result; never invent or estimate.
8. Products the store may not sell (hoodies, boots, scarves, vests) still get a tool call with that word as "product"; the server
   reports if nothing matches. Only skip the tool for missing DATA types (rule 4), never for missing products.
7. Keep it short: a sentence or two, then a compact list or table if useful. If the tool returns an error, relay it plainly
   in your own words. Never write tool-call markup such as <tool_call> in an answer.`;
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
