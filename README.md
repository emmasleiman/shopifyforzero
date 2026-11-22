# Shopify merchant metrics (Zero University case project)

Four metrics merchants can ask about, each a function over store orders, built on the Shopify order history for May to October 2025:

1. **Sales by day**
2. **Product velocity** (net units sold per day)
3. **Returns by product and reason** (counted on the return date)
4. **Repeat customer share** (the share of orders from customers who had ordered before)

Read **[NOTES.md](NOTES.md)** for the plan, the date rule ("last week", "this month") and the numbers checked against the data.

## Run it

```bash
npm install
npm test          # metric + date-rule tests
npm run dev       # http://localhost:3000 shows every metric for last week
```

## Use it

```ts
import { resolvePeriod } from "@/lib/dates";
import { returnsByProductAndReason } from "@/lib/metrics";

const { start, end } = resolvePeriod("last_week", "2025-10-28"); // 2025-10-20 .. 2025-10-26
returnsByProductAndReason(start, end, { category: "Outerwear" });
```

Over HTTP:

```
GET /api/metrics                                   # catalog of metrics
GET /api/metrics?metric=returns_by_product_and_reason&period=last_week&category=Outerwear
GET /api/metrics?metric=sales_by_day&period=this_month
GET /api/metrics?metric=product_velocity&start=2025-10-01&end=2025-10-27
```

## Layout

- `data/orders.csv`: the order export (one row per line item)
- `src/lib/orders.ts`: CSV loader (money held in cents)
- `src/lib/dates.ts`: "last week" and "this month" → exact inclusive dates
- `src/lib/metrics.ts`: the four metric functions, plus the `METRICS` registry
- `src/app/api/metrics/route.ts`: JSON API for the model in the next step
