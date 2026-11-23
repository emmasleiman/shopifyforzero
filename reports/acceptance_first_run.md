# Acceptance run: Erik Vogt's 20 questions

- Live URL: https://shopifyforzero2.vercel.app
- Model: `nvidia/nemotron-3.5-super-vl:free`
- Store today: 2025-10-27 · team default range: 2025-09-27 → 2025-10-26
- Run: 2026-11-23T05:24:04.562Z
- Completed: **20/20**

| Measure | Threshold | Result | |
|---|---|---|---|
| Tool call accuracy | ≥ 18 of 20 Y | **17 of 20** | ❌ FAIL |
| Render crash rate | 0 N | **0** | ✅ PASS |
| Time to first chart | < 5.0 s on every question | **max 17.25 s**, 3 at or over 5 s | ❌ FAIL |

| ID | Question | Tool | Dates | Args | Correct | Rendered | Seconds | Note |
|---|---|---|---|---|---|---|---|---|
| AQ-01 | sales last 30 days online store only | `sales_by_day` | 2025-09-27 → 2025-10-26 | `{"start":"2025-09-27","end":"2025-10-26","channel":"Online Store"}` | Y | Y | 4.30 | Sep 27 – Oct 26, 2025: Online store net sales were $1,230.90 across 6 orders (9 units), with $1,281.00 gross and $50.10 in discounts. |
| AQ-02 | best sellers this season | _none_ |  | `{}` | N | Y | 5.33 | no tool called |
| AQ-03 | which jackets came back the most last week | `returns_by_product_and_reason` | 2025-10-20 → 2025-10-26 | `{"period":"last_week","product":"jackets"}` | N | Y | 3.01 | filter not applied (Category: Jackets); got {"product":"Northridge Insulated Jacket"} |
| AQ-04 | are repeat customers growing since summer | `repeat_customer_share` | 2025-09-27 → 2025-10-26 (default) | `{"groupBy":"week"}` | Y | Y | 5.16 | Sep 27–Oct 26, 2025: Repeat customer share fluctuated between 33% and 50% across the last four weeks, ending at 50% in the most recent week |
| AQ-05 | sales and returns on jackets last week | `sales_by_day` | 2025-10-20 → 2025-10-26 | `{"period":"last_week","category":"Outerwear"}` | Y | Y | 2.90 | Oct 20–26, 2025: Jackets (Outerwear) had 2 orders / 2 units, $378 gross sales, $21.90 in discounts, and $356.10 net sales. All activity was |
| AQ-06 | top 5 hoodies in august | `product_velocity` | 2025-08-01 → 2025-08-31 | `{"start":"2025-08-01","end":"2025-08-31","product":"hoodie"}` | Y | Y | 3.51 | Aug 1–31, 2025: No products matching "hoodie" were found. This store sells: Organic Cotton Tee, Utility Chino, Harbor Rain Shell, Linen Butt |
| AQ-07 | what's my ad spend on Meta this month | _none_ |  | `{}` | Y | Y | 1.59 | I don't have access to Meta ad spend or any marketing cost data for your store. |
| AQ-08 | how are returns doing | _none_ |  | `{}` | N | Y | 4.74 | no tool called |
| AQ-09 | how much did i make since labor day | `sales_by_day` | 2025-09-01 → 2025-10-26 | `{"start":"2025-09-01","end":"2025-10-26"}` | Y | Y | 2.02 | Sep 1 – Oct 26, 2025: You made **$2,310.15 net** ($2,400 gross, $89.85 in discounts) across 14 orders and 21 units. |
| AQ-10 | how many ppl bought twice in october | `repeat_customer_share` | 2025-10-01 → 2025-10-27 | `{"period":"this_month"}` | Y | Y | 2.49 | Oct 1–27, 2025: 5 people bought twice (repeat orders), out of 13 total orders — a 38.46% repeat-customer share. |
| AQ-11 | what's selling rn | `product_velocity` | 2025-09-27 → 2025-10-26 (default) | `{}` | Y | Y | 3.14 | Sep 27 – Oct 26, 2025: No specific dates given, so the team default range (last 30 days) was used. Top sellers by net units sold: \| Produc |
| AQ-12 | return rate on boots lately? | `returns_by_product_and_reason` | 2025-09-27 → 2025-10-26 (default) | `{"product":"boots"}` | Y | Y | 3.54 | Sep 27 – Oct 26, 2025 (default 30-day range): No products matching "boots" were found — this store doesn't sell boots, so there are no retur |
| AQ-13 | revenue by wk recently | `sales_by_day` | 2025-09-27 → 2025-10-26 (default) | `{"groupBy":"week"}` | Y | Y | 1.96 | Sep 27–Oct 26, 2025: the team default range (last 30 days) was used since no specific dates were given. \| Week \| Orders \| Units \| Gross Sal |
| AQ-14 | repeat buyers lately on beanies and scarves | `repeat_customer_share` | 2025-09-27 → 2025-10-26 (default) | `{"product":"beanies"}` | Y | Y | 17.25 | Sep 27 – Oct 26, 2025 (team default last-30-day range, since "lately" was vague): for Wool Beanie, there were 2 orders with 1 repeat order, |
| AQ-15 | which sweaters sell best | `product_velocity` | 2025-09-27 → 2025-10-26 (default) | `{"category":"Knitwear"}` | Y | Y | 1.54 | Sep 27 – Oct 26, 2025: the team default range (last 30 days) was used. Best-selling sweaters (Knitwear): - Merino Crew Sweater — 2 units so |
| AQ-16 | top return reasons for jakets in september | `returns_by_product_and_reason` | 2025-09-01 → 2025-09-30 | `{"start":"2025-09-01","end":"2025-09-30","category":"Outerwear"}` | Y | Y | 3.37 | Sep 1–30, 2025: No return data found for jackets (Outerwear) in September — the store had no matching returns in that period. |
| AQ-17 | whats my pos vs online split | `sales_by_day` | 2025-09-27 → 2025-10-26 (default) | `{"groupBy":"channel"}` | Y | Y | 1.48 | Sep 27 – Oct 26, 2025 (default 30-day range): - **Point of Sale:** $290.00 net sales (3 orders) - **Online Store:** $1,230.90 net sales (6 |
| AQ-18 | repeat customer share | `repeat_customer_share` | 2025-09-27 → 2025-10-26 (default) | `{}` | Y | Y | 1.29 | Sep 27 – Oct 26, 2025: Repeat customer share was 41.7% (5 repeat orders out of 12 total orders). The team default range (last 30 days) was u |
| AQ-19 | refunds been bad lately? | `returns_by_product_and_reason` | 2025-09-27 → 2025-10-26 | `{"start":"2025-09-27","end":"2025-10-26"}` | Y | Y | 1.46 | Sep 27 – Oct 26, 2025 (default 30-day range): 5 return units across 2 products, totaling $920.94 refunded. - Alpine Down Parka — 3 units ($ |
| AQ-20 | how many fleece vests do i have left in stock | _none_ |  | `{}` | Y | Y | 2.27 | I don't have inventory or stock data available, so I can't tell you how many fleece vests are left. |
