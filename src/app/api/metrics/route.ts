import { NextRequest, NextResponse } from "next/server";
import { resolvePeriod, storeToday, type RelativePeriod } from "@/lib/dates";
import { METRICS, runMetric } from "@/lib/metrics";

/**
 * GET /api/metrics                                   -> metric catalog + store today
 * GET /api/metrics?metric=returns_by_product_and_reason&period=last_week&category=Outerwear
 * GET /api/metrics?metric=sales_by_day&period=this_month
 * GET /api/metrics?metric=product_velocity&start=2025-10-01&end=2025-10-27
 */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const metric = q.get("metric");
  if (!metric) {
    return NextResponse.json({
      today: storeToday(),
      periods: ["last_week", "this_month"],
      metrics: METRICS.map(({ name, description, dateBasis }) => ({ name, description, dateBasis })),
    });
  }
  try {
    const period = q.get("period") as RelativePeriod | null;
    const today = q.get("today") ?? storeToday();
    const range = period ? resolvePeriod(period, today) : { start: q.get("start") ?? "", end: q.get("end") ?? "" };
    const value = runMetric(metric, range.start, range.end, {
      category: q.get("category") ?? undefined,
      productId: q.get("productId") ?? undefined,
    });
    return NextResponse.json({ metric, ...range, value });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
