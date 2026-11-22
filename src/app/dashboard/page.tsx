import Link from "next/link";
import { ChartView } from "@/components/Charts";
import { chartSpec, formatRange, type ToolOutput } from "@/lib/chartSpec";
import { resolvePeriod, storeToday, type RelativePeriod } from "@/lib/dates";
import { productVelocity, repeatCustomerShare, returnsByProductAndReason, salesByDay } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODS: { id: RelativePeriod; label: string }[] = [
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
];

/** All four metrics for one period, drawn with the same charts the chat uses. No model involved. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const period: RelativePeriod = p === "this_month" ? "this_month" : "last_week";
  const today = storeToday();
  const { start, end } = resolvePeriod(period, today);
  const out = (result: unknown): ToolOutput => ({ dates: { start, end }, filters: {}, result });

  const specs = [
    chartSpec("sales_by_day", out(salesByDay(start, end))),
    chartSpec("product_velocity", out(productVelocity(start, end))),
    chartSpec("returns_by_product_and_reason", out(returnsByProductAndReason(start, end))),
    chartSpec("repeat_customer_share", out(repeatCustomerShare(start, end))),
  ];

  return (
    <main className="page page-wide">
      <nav className="nav">
        <Link href="/chat">Ask</Link>
        <Link href="/dashboard" aria-current="page">Dashboard</Link>
      </nav>
      <h1>Store dashboard</h1>
      <p className="sub">
        {formatRange(start, end)} · May–October 2025 orders · today is {formatRange(today, today)}
      </p>
      <div className="toggle" role="tablist">
        {PERIODS.map((x) => (
          <Link key={x.id} href={`/dashboard?period=${x.id}`} aria-current={x.id === period ? "page" : undefined}>
            {x.label}
          </Link>
        ))}
      </div>
      <div className="grid">
        {specs.map((s, i) => (s ? <ChartView key={i} spec={s} /> : null))}
      </div>
    </main>
  );
}
