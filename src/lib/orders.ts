import { readFileSync } from "node:fs";
import path from "node:path";

/** One row of the Shopify order export = one line item of an order. */
export interface OrderLine {
  orderId: string;
  lineItemId: string;
  /** Calendar date the order was placed, YYYY-MM-DD (store local time). */
  orderDate: string;
  customerId: string;
  isRepeatCustomer: boolean;
  productId: string;
  productTitle: string;
  productCategory: string;
  variant: string;
  quantity: number;
  /** Money is held in integer cents to avoid floating point drift. */
  unitPriceCents: number;
  discountCents: number;
  lineTotalCents: number;
  salesChannel: string;
  fulfillmentStatus: "fulfilled" | "partially_fulfilled" | "unfulfilled" | string;
  returned: boolean;
  /** Calendar date the return was processed, YYYY-MM-DD, or null. */
  returnDate: string | null;
  returnReason: string | null;
  refundCents: number;
}

export const DATA_FILE = path.join(process.cwd(), "data", "orders.csv");

const toCents = (v: string) => (v.trim() === "" ? 0 : Math.round(Number(v) * 100));

/** Minimal RFC 4180 line splitter (handles quoted fields with commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseOrdersCsv(csv: string): OrderLine[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const r = Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
    return {
      orderId: r.order_id,
      lineItemId: r.line_item_id,
      orderDate: r.order_date,
      customerId: r.customer_id,
      isRepeatCustomer: r.is_repeat_customer === "true",
      productId: r.product_id,
      productTitle: r.product_title,
      productCategory: r.product_category,
      variant: r.variant,
      quantity: Number(r.quantity),
      unitPriceCents: toCents(r.unit_price),
      discountCents: toCents(r.discount_amount),
      lineTotalCents: toCents(r.line_total),
      salesChannel: r.sales_channel,
      fulfillmentStatus: r.fulfillment_status,
      returned: r.returned === "true",
      returnDate: r.return_date || null,
      returnReason: r.return_reason || null,
      refundCents: toCents(r.refund_amount),
    };
  });
}

let cache: OrderLine[] | null = null;

/** Loads the May–October 2025 order history bundled in /data. */
export function loadOrders(): OrderLine[] {
  if (!cache) cache = parseOrdersCsv(readFileSync(DATA_FILE, "utf8"));
  return cache;
}
