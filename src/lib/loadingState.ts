/**
 * What the chat shows for one tool part, driven only by the tool part's
 * streaming state (no timers). Pure, so it is unit-tested.
 */
import { CHART_FOR_TOOL, chartSpec, formatRange, type ChartKind, type ChartSpec, type ToolOutput } from "./chartSpec";
import { addDays, resolvePeriod, type RelativePeriod } from "./dates";

/** Same team default as the server (src/lib/chat.ts): the last 30 days ending yesterday. */
const defaultRange = (today: string) => ({ start: addDays(today, -30), end: addDays(today, -1) });

export type ToolPartState =
  | "input-streaming" | "input-available" | "output-available" | "output-error"
  | "approval-requested" | "approval-responded" | "output-denied" | string;

export type PartView =
  | { show: "skeleton"; kind: ChartKind; caption: string }
  | { show: "chart"; spec: ChartSpec }
  | { show: "nothing" };

const VERB: Record<string, string> = {
  sales_by_day: "Checking sales",
  product_velocity: "Ranking best-sellers",
  returns_by_product_and_reason: "Checking returns",
  repeat_customer_share: "Checking repeat customers",
};

interface ToolInput { period?: RelativePeriod; start?: string; end?: string; category?: string; product?: string }

/** Dates for the caption as soon as the model has sent them, before the tool has run. */
function captionDates(input: ToolInput | undefined, today: string): string {
  if (!input) return "";
  try {
    if (input.period) {
      const r = resolvePeriod(input.period, today);
      return ` for ${formatRange(r.start, r.end)}`;
    }
    if (input.start && input.end && /^\d{4}-\d{2}-\d{2}$/.test(input.start) && /^\d{4}-\d{2}-\d{2}$/.test(input.end)) {
      return ` for ${formatRange(input.start, input.end)}`;
    }
  } catch {
    /* partial input while streaming */
  }
  return "";
}

export function partView(tool: string, state: ToolPartState, input: unknown, output: unknown, today: string): PartView {
  const kind = CHART_FOR_TOOL[tool];
  if (!kind) return { show: "nothing" };
  if (state === "input-streaming" || state === "input-available") {
    const inp = input as (ToolInput & { channel?: string }) | undefined;
    const filter = inp?.product ?? inp?.category ?? inp?.channel;
    let dates = captionDates(inp, today);
    // Input is complete but has no dates: the server will apply the team default range.
    if (!dates && state === "input-available" && !inp?.period && !inp?.start) {
      const d = defaultRange(today);
      dates = ` for ${formatRange(d.start, d.end)} (default range)`;
    }
    return { show: "skeleton", kind, caption: `${VERB[tool]}${dates}${filter ? ` · ${filter}` : ""}…` };
  }
  if (state === "output-available") {
    const spec = chartSpec(tool, output as ToolOutput);
    return spec ? { show: "chart", spec } : { show: "nothing" };
  }
  return { show: "nothing" }; // output-error, denied, anything else: text only
}
