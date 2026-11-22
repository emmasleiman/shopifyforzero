/**
 * Decides which chart to draw for a tool result. Charts are built from the
 * tool's returned data (exactly what the metric function computed), never
 * from the model's text. Pure, so it is unit-tested.
 */
import type { ChannelSales, DailySales, ProductVelocity, RepeatCustomerShare, ReturnGroup } from "./metrics";

export type ChartKind = "line" | "bar" | "channels" | "table" | "card" | "card-trend";

export interface ToolOutput {
  dates?: { start: string; end: string; source?: "period" | "explicit" | "default" };
  filters?: { category?: string; product?: string; channel?: string };
  notice?: string;
  result?: unknown;
  error?: string;
}

export interface SalesPoint { label: string; start: string; end: string; grossSales: number; netSales: number; orders: number; units: number }
export interface RepeatPoint { label: string; start: string; end: string; share: number; orders: number; repeatOrders: number }

export type ChartSpec =
  | { kind: "line"; title: string; points: SalesPoint[] }
  | { kind: "bar"; title: string; rows: ProductVelocity[] }
  | { kind: "channels"; title: string; rows: ChannelSales[] }
  | { kind: "table"; title: string; rows: ReturnGroup[]; total: { units: number; refunded: number } }
  | { kind: "card"; title: string; value: RepeatCustomerShare }
  | { kind: "card-trend"; title: string; points: RepeatPoint[] }
  | { kind: "empty"; title: string; message: string };

/** Which chart shape a tool gets, so the loading skeleton can match it before the result arrives. */
export const CHART_FOR_TOOL: Record<string, ChartKind> = {
  sales_by_day: "line",
  product_velocity: "bar",
  returns_by_product_and_reason: "table",
  repeat_customer_share: "card",
};

const LABELS: Record<string, string> = {
  sales_by_day: "Sales",
  product_velocity: "Best-sellers (net units per day)",
  returns_by_product_and_reason: "Returns",
  repeat_customer_share: "Repeat customer share",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** "Oct 20–26, 2025", "Sep 1 – Oct 26, 2025", "Oct 27, 2025". */
export function formatRange(start: string, end: string): string {
  const y = end.slice(0, 4);
  if (start === end) return `${md(start)}, ${y}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${md(start)}–${Number(end.slice(8, 10))}, ${y}`;
  return `${md(start)}${start.slice(0, 4) !== y ? `, ${start.slice(0, 4)}` : ""} – ${md(end)}, ${y}`;
}
export const shortDate = md;

/** Title like "Returns · Oct 20–26, 2025 · Outerwear". */
export function chartTitle(tool: string, out: ToolOutput): string {
  const parts = [LABELS[tool] ?? tool];
  if (out.dates) parts.push(formatRange(out.dates.start, out.dates.end) + (out.dates.source === "default" ? " (default range)" : ""));
  if (out.filters?.product) parts.push(out.filters.product);
  else if (out.filters?.category) parts.push(out.filters.category);
  if (out.filters?.channel) parts.push(out.filters.channel);
  return parts.join(" · ");
}

const NO_DATA = "No orders in this range";

/** Returns null when no chart should be drawn (no tool, error, or unknown tool). */
export function chartSpec(tool: string, out: ToolOutput | undefined | null): ChartSpec | null {
  if (!out || out.error || out.result === undefined || !(tool in CHART_FOR_TOOL)) return null;
  const title = chartTitle(tool, out);
  const empty = (fallback: string): ChartSpec => ({ kind: "empty", title, message: out.notice ?? fallback });

  switch (tool) {
    case "sales_by_day": {
      if (Array.isArray(out.result) && out.result.length > 0 && "channel" in (out.result[0] as object)) {
        const rows = out.result as ChannelSales[];
        return rows.every((r) => r.orders === 0) ? empty(NO_DATA) : { kind: "channels", title: title.replace(/^Sales/, "Sales by channel"), rows };
      }
      if (Array.isArray(out.result) && out.result.length === 0) return empty(NO_DATA);
      const raw = out.result as Array<DailySales | (Omit<DailySales, "date"> & { start: string; end: string })>;
      const points: SalesPoint[] = raw.map((r) => {
        const start = "date" in r ? r.date : r.start;
        const end = "date" in r ? r.date : r.end;
        return { label: md(start), start, end, grossSales: r.grossSales, netSales: r.netSales, orders: r.orders, units: r.units };
      });
      if (points.every((p) => p.orders === 0)) return empty(NO_DATA);
      return { kind: "line", title, points };
    }
    case "product_velocity": {
      const rows = [...(out.result as ProductVelocity[])].sort(
        (a, b) => b.netUnitsPerDay - a.netUnitsPerDay || a.title.localeCompare(b.title),
      );
      if (rows.length === 0) return empty(NO_DATA);
      return { kind: "bar", title, rows };
    }
    case "returns_by_product_and_reason": {
      const rows = out.result as ReturnGroup[];
      if (rows.length === 0) return empty("No returns in this range");
      const total = {
        units: rows.reduce((a, r) => a + r.units, 0),
        refunded: Math.round(rows.reduce((a, r) => a + r.refunded, 0) * 100) / 100,
      };
      return { kind: "table", title, rows, total };
    }
    case "repeat_customer_share": {
      if (Array.isArray(out.result)) {
        const points = (out.result as Array<RepeatCustomerShare & { start: string; end: string }>).map((r) => ({
          label: md(r.start), start: r.start, end: r.end, share: r.share, orders: r.orders, repeatOrders: r.repeatOrders,
        }));
        if (points.every((p) => p.orders === 0)) return empty(NO_DATA);
        return { kind: "card-trend", title, points };
      }
      const value = out.result as RepeatCustomerShare;
      if (value.orders === 0) return empty(NO_DATA);
      return { kind: "card", title, value };
    }
  }
  return null;
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
