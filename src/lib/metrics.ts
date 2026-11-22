/**
 * Store metrics. Every metric is a pure function over store orders:
 *
 *     metric(start, end, options?) -> value
 *
 *  - start / end: inclusive calendar dates, YYYY-MM-DD (resolve "last week"
 *    etc. with resolvePeriod() in ./dates first).
 *  - options.category / options.productId narrow to part of the catalog
 *    (e.g. category "Outerwear" for jackets).
 *  - options.orders lets tests or other stores supply their own data.
 *
 * Each metric is keyed to ONE event date, stated in its description:
 *  - sales metrics count lines whose ORDER date is in range;
 *  - return metrics count lines whose RETURN date is in range.
 * This matches Shopify Analytics, where a return is reported on the day it
 * happens, not on the day of the original sale.
 */
import { assertRange, daysInRange, inRange } from "./dates";
import { loadOrders, type OrderLine } from "./orders";

export interface MetricOptions {
  category?: string;
  productId?: string;
  orders?: OrderLine[];
}

const dollars = (cents: number) => Math.round(cents) / 100;
const ratio = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 10_000) / 10_000);
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function scoped(start: string, end: string, opts: MetricOptions = {}): OrderLine[] {
  assertRange(start, end);
  const cat = opts.category?.toLowerCase();
  return (opts.orders ?? loadOrders()).filter(
    (l) =>
      (!cat || l.productCategory.toLowerCase() === cat) &&
      (!opts.productId || l.productId === opts.productId),
  );
}
const placed = (start: string, end: string, o?: MetricOptions) =>
  scoped(start, end, o).filter((l) => inRange(l.orderDate, start, end));
const returnedIn = (start: string, end: string, o?: MetricOptions) =>
  scoped(start, end, o).filter((l) => l.returned && inRange(l.returnDate, start, end));

// ---------------------------------------------------------------- sales

/** Gross sales ($): quantity × unit price, before discounts and returns. Order date. */
export function grossSales(start: string, end: string, o?: MetricOptions): number {
  return dollars(sum(placed(start, end, o), (l) => l.quantity * l.unitPriceCents));
}

/** Discounts ($) given on orders placed in range. Order date. */
export function discounts(start: string, end: string, o?: MetricOptions): number {
  return dollars(sum(placed(start, end, o), (l) => l.discountCents));
}

/** Net sales ($) = gross sales − discounts (order date) − refunds (return date). Shopify's definition. */
export function netSales(start: string, end: string, o?: MetricOptions): number {
  const lines = placed(start, end, o);
  const gross = sum(lines, (l) => l.quantity * l.unitPriceCents);
  const disc = sum(lines, (l) => l.discountCents);
  const refunds = sum(returnedIn(start, end, o), (l) => l.refundCents);
  return dollars(gross - disc - refunds);
}

/** Number of distinct orders placed. Order date. */
export function orderCount(start: string, end: string, o?: MetricOptions): number {
  return new Set(placed(start, end, o).map((l) => l.orderId)).size;
}

/** Average order value ($) = (gross sales − discounts) / orders. Order date. */
export function averageOrderValue(start: string, end: string, o?: MetricOptions): number {
  const lines = placed(start, end, o);
  const orders = new Set(lines.map((l) => l.orderId)).size;
  return orders === 0 ? 0 : dollars(sum(lines, (l) => l.lineTotalCents) / orders);
}

/** Units sold. Order date. */
export function unitsSold(start: string, end: string, o?: MetricOptions): number {
  return sum(placed(start, end, o), (l) => l.quantity);
}

/** Share of orders (0–1) placed by returning customers. Order date. */
export function repeatCustomerRate(start: string, end: string, o?: MetricOptions): number {
  const lines = placed(start, end, o);
  const all = new Set(lines.map((l) => l.orderId));
  const repeat = new Set(lines.filter((l) => l.isRepeatCustomer).map((l) => l.orderId));
  return ratio(repeat.size, all.size);
}

/** Orders and sales after discounts ($) per sales channel. Order date. */
export function salesByChannel(start: string, end: string, o?: MetricOptions) {
  const by = new Map<string, { orders: Set<string>; cents: number }>();
  for (const l of placed(start, end, o)) {
    const e = by.get(l.salesChannel) ?? { orders: new Set(), cents: 0 };
    e.orders.add(l.orderId);
    e.cents += l.lineTotalCents;
    by.set(l.salesChannel, e);
  }
  return [...by]
    .map(([channel, e]) => ({ channel, orders: e.orders.size, sales: dollars(e.cents) }))
    .sort((a, b) => b.sales - a.sales);
}

/** Line items not yet fully shipped (unfulfilled or partially fulfilled). Order date. */
export function unfulfilledItems(start: string, end: string, o?: MetricOptions) {
  const open = placed(start, end, o).filter((l) => l.fulfillmentStatus !== "fulfilled");
  return {
    lineItems: open.length,
    units: sum(open, (l) => l.quantity),
    orders: new Set(open.map((l) => l.orderId)).size,
  };
}

// ---------------------------------------------------------------- returns

/** Returns processed: line items, units and refunded $. Return date. */
export function returns(start: string, end: string, o?: MetricOptions) {
  const r = returnedIn(start, end, o);
  return { lineItems: r.length, units: sum(r, (l) => l.quantity), refunded: dollars(sum(r, (l) => l.refundCents)) };
}

/** Returns processed, grouped by reason (most frequent first). Return date. */
export function returnsByReason(start: string, end: string, o?: MetricOptions) {
  const by = new Map<string, { units: number; cents: number; products: Set<string> }>();
  for (const l of returnedIn(start, end, o)) {
    const k = l.returnReason ?? "Unknown";
    const e = by.get(k) ?? { units: 0, cents: 0, products: new Set() };
    e.units += l.quantity;
    e.cents += l.refundCents;
    e.products.add(l.productTitle);
    by.set(k, e);
  }
  return [...by]
    .map(([reason, e]) => ({ reason, units: e.units, refunded: dollars(e.cents), products: [...e.products] }))
    .sort((a, b) => b.units - a.units || b.refunded - a.refunded || a.reason.localeCompare(b.reason));
}

/**
 * Return rate (0–1): of the units SOLD in range, the share returned so far.
 * Order date (cohort view). Recent ranges read low because their returns may
 * not have arrived yet.
 */
export function returnRate(start: string, end: string, o?: MetricOptions): number {
  const lines = placed(start, end, o);
  return ratio(sum(lines.filter((l) => l.returned), (l) => l.quantity), sum(lines, (l) => l.quantity));
}

// ---------------------------------------------------------------- products / reorder

/**
 * Per-product demand for reorder planning: units sold, units since returned,
 * net units kept, and net units per day across the range. Order date.
 * Sorted by net units, highest first.
 */
export function productVelocity(start: string, end: string, o?: MetricOptions) {
  const days = daysInRange({ start, end });
  const by = new Map<string, { title: string; category: string; sold: number; returned: number; cents: number }>();
  for (const l of placed(start, end, o)) {
    const e = by.get(l.productId) ?? { title: l.productTitle, category: l.productCategory, sold: 0, returned: 0, cents: 0 };
    e.sold += l.quantity;
    if (l.returned) e.returned += l.quantity;
    e.cents += l.lineTotalCents - (l.returned ? l.refundCents : 0);
    by.set(l.productId, e);
  }
  return [...by]
    .map(([productId, e]) => ({
      productId,
      title: e.title,
      category: e.category,
      unitsSold: e.sold,
      unitsReturned: e.returned,
      netUnits: e.sold - e.returned,
      netSales: dollars(e.cents),
      netUnitsPerDay: Math.round(((e.sold - e.returned) / days) * 1000) / 1000,
    }))
    .sort((a, b) => b.netUnits - a.netUnits || b.netSales - a.netSales);
}

// ---------------------------------------------------------------- registry

export type DateBasis = "order_date" | "return_date" | "order_and_return_date";

export interface MetricDefinition {
  name: string;
  description: string;
  dateBasis: DateBasis;
  unit: "usd" | "count" | "ratio" | "table";
  fn: (start: string, end: string, o?: MetricOptions) => unknown;
}

/** Catalog the model will use as its tool list in the next step. */
export const METRICS: MetricDefinition[] = [
  { name: "gross_sales", fn: grossSales, unit: "usd", dateBasis: "order_date", description: "Quantity × unit price before discounts and returns." },
  { name: "discounts", fn: discounts, unit: "usd", dateBasis: "order_date", description: "Total discounts applied to orders." },
  { name: "net_sales", fn: netSales, unit: "usd", dateBasis: "order_and_return_date", description: "Gross sales − discounts − refunds processed in the range." },
  { name: "order_count", fn: orderCount, unit: "count", dateBasis: "order_date", description: "Distinct orders placed." },
  { name: "average_order_value", fn: averageOrderValue, unit: "usd", dateBasis: "order_date", description: "(Gross sales − discounts) / orders." },
  { name: "units_sold", fn: unitsSold, unit: "count", dateBasis: "order_date", description: "Units sold." },
  { name: "repeat_customer_rate", fn: repeatCustomerRate, unit: "ratio", dateBasis: "order_date", description: "Share of orders from returning customers." },
  { name: "sales_by_channel", fn: salesByChannel, unit: "table", dateBasis: "order_date", description: "Orders and sales after discounts per channel." },
  { name: "unfulfilled_items", fn: unfulfilledItems, unit: "table", dateBasis: "order_date", description: "Line items, units and orders not yet fully shipped." },
  { name: "returns", fn: returns, unit: "table", dateBasis: "return_date", description: "Returned line items, units and refunded dollars." },
  { name: "returns_by_reason", fn: returnsByReason, unit: "table", dateBasis: "return_date", description: "Returns grouped by reason, with products involved." },
  { name: "return_rate", fn: returnRate, unit: "ratio", dateBasis: "order_date", description: "Share of units sold in the range that were later returned." },
  { name: "product_velocity", fn: productVelocity, unit: "table", dateBasis: "order_date", description: "Per-product units sold, returned, net, and net units per day, for reorder planning." },
];

export function runMetric(name: string, start: string, end: string, o?: MetricOptions) {
  const m = METRICS.find((x) => x.name === name);
  if (!m) throw new Error(`Unknown metric "${name}". Known: ${METRICS.map((x) => x.name).join(", ")}`);
  return m.fn(start, end, o);
}
