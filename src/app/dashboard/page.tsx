import Link from "next/link";
import { ChartView } from "@/components/Charts";
import { Colophon, Masthead } from "@/components/Masthead";
import { chartSpec, formatRange, money, pct, type ToolOutput } from "@/lib/chartSpec";
import { resolvePeriod, storeToday, type RelativePeriod } from "@/lib/dates";
import { productVelocity, repeatCustomerShare, returnsByProductAndReason, salesByDay } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODS: { id: RelativePeriod; label: string; headline: string }[] = [
  { id: "last_week", label: "Last week", headline: "How the store did last week." },
  { id: "this_month", label: "This month", headline: "How the store is doing this month." },
];

/** All four metrics for one period, drawn with the same charts the chat uses. No model involved. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const period = PERIODS.find((x) => x.id === p) ?? PERIODS[0];
  const today = storeToday();
  const { start, end } = resolvePeriod(period.id, today);
  const out = (result: unknown): ToolOutput => ({ dates: { start, end }, filters: {}, result });

  const sales = salesByDay(start, end);
  const velocity = productVelocity(start, end);
  const returns = returnsByProductAndReason(start, end);
  const repeat = repeatCustomerShare(start, end);

  const net = sales.reduce((s, d) => s + d.netSales, 0);
  const orders = sales.reduce((s, d) => s + d.orders, 0);
  const returnedUnits = returns.reduce((s, r) => s + r.units, 0);
  const refunded = returns.reduce((s, r) => s + r.refunded, 0);
  const best = velocity.find((v) => v.netUnits > 0);

  const kpis = [
    { label: "Net sales", value: money(net), sub: `${orders} order${orders === 1 ? "" : "s"}` },
    { label: "Top seller", value: best?.title ?? "None", sub: best ? `${best.netUnits} net unit${best.netUnits === 1 ? "" : "s"} sold` : "No net sales", small: true },
    { label: "Returned", value: `${returnedUnits} unit${returnedUnits === 1 ? "" : "s"}`, sub: `${money(refunded)} refunded` },
    { label: "Repeat customers", value: pct(repeat.share), sub: `${repeat.repeatOrders} of ${repeat.orders} orders` },
  ];

  const specs = [
    chartSpec("sales_by_day", out(sales)),
    chartSpec("product_velocity", out(velocity)),
    chartSpec("returns_by_product_and_reason", out(returns)),
    chartSpec("repeat_customer_share", out(repeat)),
  ];

  return (
    <main className="page page-wide">
      <Masthead current="dashboard" />
      <section className="hero">
        <p className="eyebrow">{formatRange(start, end)} · {period.label}</p>
        <h1 className="headline" style={{ marginTop: 10 }}>{period.headline}</h1>
        <p className="lede">
          Sales, best-sellers, returns and repeat customers, straight from the order history. The same four charts
          appear under every answer on the Ask page.
        </p>
      </section>

      <div className="toolbar">
        <div className="toggle" role="tablist" aria-label="Period">
          {PERIODS.map((x) => (
            <Link key={x.id} href={`/dashboard?period=${x.id}`} aria-current={x.id === period.id ? "page" : undefined}>
              {x.label}
            </Link>
          ))}
        </div>
        <Link href="/chat" className="btn">Ask a question</Link>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <div className="label">{k.label}</div>
            <div className="kpi-value" style={k.small ? { fontSize: "clamp(1.2rem, 2.2vw, 1.55rem)", paddingTop: 6 } : undefined}>{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid">
        {specs.map((s, i) => (s ? <ChartView key={i} spec={s} /> : null))}
      </div>
      <Colophon />
    </main>
  );
}
