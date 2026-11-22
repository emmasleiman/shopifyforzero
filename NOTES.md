# Step 1 notes: merchant metrics

## The goal

Merchants ask questions about their store in plain language. Two things they can't see today:

1. **Last week's jacket returns.** Which jackets came back, and why.
2. **The Black Friday sales ramp and reorders.** Reorder windows are closing (Black Friday 2025 is Fri 28 Nov).

Each metric is a function over store orders that takes a start date and an end date. The model we connect next turns the merchant's wording into dates, calls the function, and answers with the numbers it returns. The model never does the arithmetic itself.

## Plan

| # | Step | Where |
|---|------|-------|
| 1 | Start a Next.js repo (TypeScript, App Router) with the Shopify order history, May to October 2025: 28 line items, 20 orders, 2025-05-06 to 2025-10-27 | `data/orders.csv`, `src/lib/orders.ts` |
| 2 | Choose the metrics and a rule that turns vague dates into exact dates | `src/lib/dates.ts`, this file |
| 3 | Write one function per metric, each taking a start date and an end date | `src/lib/metrics.ts`, `/api/metrics` |

## Approved metrics

| # | Metric | Function | Counts by | Decision it helps with |
|---|---|---|---|---|
| 1 | Sales by day | `salesByDay` | order date | Watch the Black Friday ramp day by day: orders, units, gross sales, discounts and net sales (gross − discounts). Days with no orders still appear. |
| 2 | Product velocity | `productVelocity` | order date | Find best-sellers and decide reorders. Gives units sold, units returned, net units and **net units per day**. |
| 3 | Returns by product and reason | `returnsByProductAndReason` | **return date** | See which products come back and why, e.g. jacket sizing. |
| 4 | Repeat customer share | `repeatCustomerShare` | order date | The share of orders from customers who had ordered before. It decides whether Black Friday targets **past buyers** (early access, email) or **new customers** (ads). |

All four take `(start, end, options?)`. `options.category` (e.g. `"Outerwear"` for jackets) or `options.productId` narrow the results. Money is held in integer cents and returned as dollars.

## Date rule (approved)

- **Calendar dates in the store's time zone.** Every date is `YYYY-MM-DD`, and each range includes both its start and end date.
- **"Today" is passed in every time**, never read from the clock. The same question always gives the same dates.
- **"Last week"** is the most recent **complete Monday–Sunday week**.
  - Today Tue 28 Oct 2025 → **20–26 Oct**.
  - If today is a Sunday, that week isn't finished, so last week is the week before.
- **"This month"** runs **from the 1st of the month to today**.
  - Today 28 Oct 2025 → **1–28 Oct**.
- **Returns count on the return date.** So "last week's jacket returns" means jackets *returned* 20–26 Oct, not jackets bought then.
- The data ends on 2025-10-27, so the demo uses today = **2025-10-28**. Override it with the `STORE_TODAY` env var.

## Checked against the data

**Last week (20–26 Oct 2025)**
- Sales: $570 gross from 4 orders. The busiest day was 23 Oct ($265 gross, $238.50 net).
- Returns: **4 jackets, $792.15 refunded, all Outerwear.**
  - Alpine Down Parka ×3: Defective, Too large and Too small.
  - Northridge Insulated Jacket ×1: Too small.
  - 3 of the 4 returns are sizing problems.
- Repeat customer share: **50%** (2 of 4 orders).

**This month (1–28 Oct 2025)**
- Product velocity: the Wool Beanie leads with 4 net units (0.143 per day).
  - The Alpine Down Parka sold 4 but 3 came back, so it netted 1 unit (0.036 per day).
  - Its gross sales overstate how much to reorder.
- Repeat customer share: **38%** (5 of 13 orders).

**All of May to October:** repeat customer share is **40%** (8 of 20 orders).

## Assumptions

- A returned line counts as the whole line quantity. The export has no field for a partial quantity.
- Net sales in "sales by day" means gross sales minus discounts. Refunds are reported separately, by return date, in metric 3.
- There is no inventory or lead-time data, so product velocity shows demand only. Reorder quantities also need stock on hand.

## The prompt used to build this

> Start a Next.js app (TypeScript, App Router) in this folder. Put the Shopify order export, `Store Order History, May to October 2025.csv`, in `data/orders.csv` and write a loader for it. Each row is one line item. Store money in whole cents.
>
> Write one function per metric. Each takes `(start, end)` as calendar dates (`YYYY-MM-DD`), counts both end dates, and takes an optional category or product filter:
> 1. **Sales by day:** gross sales, discounts and net sales for each day, counted on the **order date**.
> 2. **Product velocity:** for each product, units sold, units returned, net units, and net units per day, counted on the **order date**.
> 3. **Returns by product and reason:** counted on the **return date**, not the order date.
> 4. **Repeat customer share:** the share of orders from customers who had ordered before, using `is_repeat_customer`.
>
> Add a date resolver that takes the store's "today" as an input and never reads the system clock:
> - **"last week"** is the most recent complete Monday–Sunday week
> - **"this month"** runs from the 1st of the month to today
>
> Write tests with numbers checked by hand against the CSV. For example, if today is 2025-10-28, last week is 20–26 Oct, and returns that week are 4 jackets with $792.15 refunded. Then commit and push to my GitHub repo.

## Next step

Connect Claude. Expose `METRICS` as tools that take `start`, `end`, `category` and `productId`. Give the model the date rule and the store's "today".
