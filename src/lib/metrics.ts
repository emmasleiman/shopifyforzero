/**
 * The four approved store metrics. Each is a pure function over store orders:
 *
 *     metric(start, end, options?) -> value
 *
 *  - start / end: inclusive calendar dates, YYYY-MM-DD, in the store's time zone.
 *    Resolve "last week" / "this month" with resolvePeriod() in ./dates first.
 *  - options.category / options.productId narrow to part of the catalog
 *    (e.g. category "Outerwear" for jackets).
 *  - options.orders lets tests or other stores supply their own data.
 *
 * Each metric counts ONE event date:
 *  - sales, velocity and repeat share count lines by ORDER date;
 *  - returns count lines by RETURN date (as Shopify Analytics does), so
 *    "last week's jacket returns" means jackets returned last week.
 */
import { assertRange, daysInRange, eachDay, inRange } from "./dates";
import { loadOrders, type OrderLine } from "./orders";

export interface MetricOptions {
  category?: string;
  productId?: string;
  /** Sales channel, e.g. "Online Store", "Point of Sale", "Shop app", "Instagram". */
  channel?: string;
  orders?: OrderLine[];
}

const dollars = (cents: number) => Math.round(cents) / 100;
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function scoped(start: string, end: string, opts: MetricOptions = {}): OrderLine[] {
  assertRange(start, end);
  const cat = opts.category?.toLowerCase();
  const ch = opts.channel?.toLowerCase();
  return (opts.orders ?? loadOrders()).filter(
    (l) =>
      (!cat || l.productCategory.toLowerCase() === cat) &&
      (!opts.productId || l.productId === opts.productId) &&
      (!ch || l.salesChannel.toLowerCase() === ch),
  );
}
const placed = (start: string, end: string, o?: MetricOptions) =>
  scoped(start, end, o).filter((l) => inRange(l.orderDate, start, end));

// ------------------------------------------------------------ 1. sales by day

export interface DailySales {
  date: string;
  orders: number;
  units: number;
  grossSales: number;
  discounts: number;
  netSales: number;
}

/**
 * Sales for every day in the range, including days with no orders, so the
 * Black Friday ramp shows as a continuous series. Order date.
 * grossSales = quantity × unit price; netSales = gross − discounts.
 */
export function salesByDay(start: string, end: string, o?: MetricOptions): DailySales[] {
  const lines = placed(start, end, o);
  return eachDay(start, end).map((date) => {
    const day = lines.filter((l) => l.orderDate === date);
    const gross = sum(day, (l) => l.quantity * l.unitPriceCents);
    const disc = sum(day, (l) => l.discountCents);
    return {
      date,
      orders: new Set(day.map((l) => l.orderId)).size,
      units: sum(day, (l) => l.quantity),
      grossSales: dollars(gross),
      discounts: dollars(disc),
      netSales: dollars(gross - disc),
    };
  });
}

export interface ChannelSales {
  channel: string;
  orders: number;
  units: number;
  grossSales: number;
  netSales: number;
}

/** Sales split by channel (a view of sales by day, summed over the range). Order date. */
export function salesByChannel(start: string, end: string, o?: MetricOptions): ChannelSales[] {
  const by = new Map<string, { orders: Set<string>; units: number; gross: number; disc: number }>();
  for (const l of placed(start, end, o)) {
    const e = by.get(l.salesChannel) ?? { orders: new Set<string>(), units: 0, gross: 0, disc: 0 };
    e.orders.add(l.orderId);
    e.units += l.quantity;
    e.gross += l.quantity * l.unitPriceCents;
    e.disc += l.discountCents;
    by.set(l.salesChannel, e);
  }
  return [...by]
    .map(([channel, e]) => ({ channel, orders: e.orders.size, units: e.units, grossSales: dollars(e.gross), netSales: dollars(e.gross - e.disc) }))
    .sort((a, b) => b.netSales - a.netSales);
}

// ------------------------------------------------------------ 2. product velocity

export interface ProductVelocity {
  productId: string;
  title: string;
  category: string;
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  netUnitsPerDay: number;
}

/**
 * Best-sellers for reorder planning: per product, units sold in the range,
 * how many of those came back, net units kept, and net units per day.
 * Order date. Sorted by net units per day, highest first.
 */
export function productVelocity(start: string, end: string, o?: MetricOptions): ProductVelocity[] {
  const days = daysInRange({ start, end });
  const by = new Map<string, { title: string; category: string; sold: number; returned: number }>();
  for (const l of placed(start, end, o)) {
    const e = by.get(l.productId) ?? { title: l.productTitle, category: l.productCategory, sold: 0, returned: 0 };
    e.sold += l.quantity;
    if (l.returned) e.returned += l.quantity;
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
      netUnitsPerDay: Math.round(((e.sold - e.returned) / days) * 1000) / 1000,
    }))
    .sort((a, b) => b.netUnitsPerDay - a.netUnitsPerDay || a.title.localeCompare(b.title));
}

// ------------------------------------------------------------ 3. returns by product and reason

export interface ReturnGroup {
  productId: string;
  title: string;
  category: string;
  reason: string;
  units: number;
  refunded: number;
}

/**
 * Returns processed in the range, grouped by product and reason.
 * RETURN date. Sorted by units, then refunded dollars, highest first.
 */
export function returnsByProductAndReason(start: string, end: string, o?: MetricOptions): ReturnGroup[] {
  const by = new Map<string, ReturnGroup & { cents: number }>();
  for (const l of scoped(start, end, o)) {
    if (!l.returned || !inRange(l.returnDate, start, end)) continue;
    const reason = l.returnReason ?? "Unknown";
    const key = `${l.productId}|${reason}`;
    const e = by.get(key) ?? { productId: l.productId, title: l.productTitle, category: l.productCategory, reason, units: 0, refunded: 0, cents: 0 };
    e.units += l.quantity;
    e.cents += l.refundCents;
    by.set(key, e);
  }
  return [...by.values()]
    .map(({ cents, ...g }) => ({ ...g, refunded: dollars(cents) }))
    .sort((a, b) => b.units - a.units || b.refunded - a.refunded || a.title.localeCompare(b.title) || a.reason.localeCompare(b.reason));
}

// ------------------------------------------------------------ 4. repeat customer share

export interface RepeatCustomerShare {
  orders: number;
  repeatOrders: number;
  share: number;
}

/**
 * Share of orders placed in the range that came from customers who had
 * ordered before (Shopify's is_repeat_customer flag, which also reflects
 * purchases made before this export starts). Order date.
 */
export function repeatCustomerShare(start: string, end: string, o?: MetricOptions): RepeatCustomerShare {
  const lines = placed(start, end, o);
  const all = new Set(lines.map((l) => l.orderId));
  const repeat = new Set(lines.filter((l) => l.isRepeatCustomer).map((l) => l.orderId));
  return {
    orders: all.size,
    repeatOrders: repeat.size,
    share: all.size === 0 ? 0 : Math.round((repeat.size / all.size) * 10_000) / 10_000,
  };
}

// ------------------------------------------------------------ registry

export interface MetricDefinition {
  name: string;
  description: string;
  dateBasis: "order_date" | "return_date";
  fn: (start: string, end: string, o?: MetricOptions) => unknown;
}

/** The metric catalog the model will use as its tool list in the next step. */
export const METRICS: MetricDefinition[] = [
  { name: "sales_by_day", fn: salesByDay, dateBasis: "order_date", description: "Orders, units, gross sales, discounts and net sales for each day in the range." },
  { name: "product_velocity", fn: productVelocity, dateBasis: "order_date", description: "Per product: units sold, units returned, net units and net units sold per day. Use for best-sellers and reorders." },
  { name: "returns_by_product_and_reason", fn: returnsByProductAndReason, dateBasis: "return_date", description: "Returns processed in the range, grouped by product and return reason, with units and refunded dollars." },
  { name: "repeat_customer_share", fn: repeatCustomerShare, dateBasis: "order_date", description: "Share of orders in the range from customers who had ordered before." },
];

export function runMetric(name: string, start: string, end: string, o?: MetricOptions) {
  const m = METRICS.find((x) => x.name === name);
  if (!m) throw new Error(`Unknown metric "${name}". Known: ${METRICS.map((x) => x.name).join(", ")}`);
  return m.fn(start, end, o);
}
