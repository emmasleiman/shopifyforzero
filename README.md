# Shopify merchant metrics (Zero University case project)

Metrics that merchants can ask about. Each metric is a function over a store's orders, built on the Shopify order history for May to October 2025. Read **[NOTES.md](NOTES.md)** for the plan, the "last week" rule and the metric definitions.

## Run it

```bash
npm install
npm test          # metric + date-rule tests
npm run dev       # http://localhost:3000 shows every metric for last week
```

## Use it

```ts
import { resolvePeriod } from "@/lib/dates";
import { returnsByReason } from "@/lib/metrics";

const { start, end } = resolvePeriod("last_week", "2025-10-28"); // 2025-10-20 .. 2025-10-26
returnsByReason(start, end, { category: "Outerwear" });
```

Over HTTP:

```
GET /api/metrics                                   # catalog of metrics
GET /api/metrics?metric=returns&period=last_week&category=Outerwear
GET /api/metrics?metric=net_sales&start=2025-10-01&end=2025-10-31
```

## Layout

- `data/orders.csv`: the order export (one row per line item)
- `src/lib/orders.ts`: CSV loader (money held in cents)
- `src/lib/dates.ts`: "last week" and other relative periods → exact inclusive dates
- `src/lib/metrics.ts`: one function per metric, plus the `METRICS` registry
- `src/app/api/metrics/route.ts`: JSON API for the model in the next step
