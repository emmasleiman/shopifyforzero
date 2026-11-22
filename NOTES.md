# Step 1 notes: merchant metrics

## The goal

Merchants ask questions about their store in plain language. Two questions they can't answer today:

1. **"What happened with jacket returns last week?"** They can't see returns broken down by product, week and reason.
2. **"What should I reorder for Black Friday?"** Reorder windows are closing (Black Friday 2025 is Fri 28 Nov), and they need net demand per product.

This step defines the metrics. Each metric is a function over store orders that takes a start date and an end date. The model we connect in the next step picks a metric, turns the merchant's wording into dates, and calls the function. The model never does the arithmetic itself.

## Plan

| # | Step | Result | Where |
|---|------|--------|-------|
| 1 | Start a Next.js repo with the Shopify order history, May to October 2025 | Next.js 15 (App Router, TypeScript). The export is in `data/orders.csv`: 28 line items, 20 orders, 2025-05-06 to 2025-10-27 | `data/`, `src/lib/orders.ts` |
| 2 | Choose the metrics and a rule that turns "last week" into exact dates | 13 metrics (below) and the Monday–Sunday rule | `src/lib/dates.ts`, this file |
| 3 | One function per metric, taking a start and end date | `metric(start, end, options?)`, plus the `METRICS` registry and `/api/metrics` | `src/lib/metrics.ts`, `src/app/api/metrics/route.ts` |

## The "last week" rule

- Dates are **calendar dates (`YYYY-MM-DD`) in the store's time zone**. Ranges are **inclusive on both ends**.
- Weeks run **Monday to Sunday** (ISO 8601).
- **Last week = the most recent complete Monday–Sunday week before the week that contains today.** It never includes today and never includes a partial week.
  - Today Mon 27 Oct 2025 or Tue 28 Oct 2025 → **20 Oct to 26 Oct 2025**
  - Today Sun 26 Oct 2025 → 13 Oct to 19 Oct 2025 (the week of the 20th isn't over yet)
- These phrases have their own rules: *last 7 days* is the 7 days ending yesterday, *this week* runs from Monday to today, and *last month* is the previous full calendar month.
- "Today" is always passed in explicitly, so the same question gives the same answer every time. The data ends on 2025-10-27, so the demo uses **today = 2025-10-28**. Change it with the `STORE_TODAY` env var.
- Tests cover month and year boundaries and DST weeks. All date math runs in UTC, so the server's own time zone can't move a date.

## Which date a metric counts

Every metric counts **one** event date:

- **Sales metrics** count lines by **order date**.
- **Return metrics** count lines by **return date**. Shopify Analytics does the same.

If we got this wrong, "last week's jacket returns" would show jackets *bought* last week. That answers a different question.

## Metrics

All money is held in integer cents and returned as dollars. The optional `options` argument takes `category` (e.g. `"Outerwear"`, which is how merchants mean "jackets") or `productId`.

| Metric | Function | Counts by | Definition |
|---|---|---|---|
| gross_sales | `grossSales` | order date | quantity × unit price |
| discounts | `discounts` | order date | sum of discounts |
| net_sales | `netSales` | order + return date | gross − discounts − refunds processed in range (Shopify definition) |
| order_count | `orderCount` | order date | distinct orders |
| average_order_value | `averageOrderValue` | order date | (gross − discounts) / orders |
| units_sold | `unitsSold` | order date | sum of quantity |
| repeat_customer_rate | `repeatCustomerRate` | order date | share of orders from returning customers |
| sales_by_channel | `salesByChannel` | order date | orders and sales after discounts, per channel |
| unfulfilled_items | `unfulfilledItems` | order date | lines, units and orders not fully shipped |
| returns | `returns` | return date | returned lines, units and refunded $ |
| returns_by_reason | `returnsByReason` | return date | returns grouped by reason, with the products involved |
| return_rate | `returnRate` | order date (cohort) | share of units sold in range that were later returned |
| product_velocity | `productVelocity` | order date | per product: sold, returned, net units, net $, net units/day (for reorders) |

## Checked against the data: last week (20–26 Oct 2025)

- Gross sales **$570.00**, discounts $26.50, 4 orders, 7 units, AOV $135.88, 50% from repeat customers.
- **Returns: 4 jackets (all Outerwear), $792.15 refunded.** Alpine Down Parka ×3 and Northridge Insulated Jacket ×1.
  - Reasons: Too small ×2, Too large ×1, Defective ×1. **3 of the 4 returns are sizing problems.**
- **Net sales came out at −$248.65.** Jacket refunds were larger than the week's sales.
- 2 items are still unfulfilled: Northridge Jacket (#2917) and Alpine Down Parka (#2988).
- October demand for the Black Friday reorder: the Alpine Down Parka sold 4 but 3 came back, leaving 1 net. The Wool Beanie leads on net units (4). So the parka's gross sales overstate how much to reorder.

## Open questions and assumptions

- A returned line counts as the whole line quantity. The export has no field for a partial quantity. Refunds can still be partial (#2214 refunded $128.79 of $143.10).
- `partially_fulfilled` counts the whole line as open, because the export doesn't say how many units shipped.
- There is no inventory or lead-time data, so `product_velocity` gives demand only. Reorder quantities need stock on hand and supplier lead times. We should add those next.
- The return rate for recent weeks reads low because returns are still arriving.

## Next step

Connect the model (Claude). Expose `METRICS` as tools, each with `start`, `end`, `category` and `productId` parameters. Give the model `resolvePeriod` (or the rule above) and the store's today. The model answers with the numbers the functions return.
