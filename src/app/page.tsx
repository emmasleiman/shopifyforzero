import { resolvePeriod, storeToday, type RelativePeriod } from "@/lib/dates";
import { METRICS } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODS: { id: RelativePeriod; label: string }[] = [
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
];

export default function Home() {
  const today = storeToday();
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Store metrics</h1>
      <p>
        Store today: <b>{today}</b>. Dates are inclusive, in the store&apos;s time zone. Returns count on the return
        date; everything else on the order date.
      </p>
      {PERIODS.map(({ id, label }) => {
        const { start, end } = resolvePeriod(id, today);
        return (
          <section key={id}>
            <h2>
              {label}: {start} to {end}
            </h2>
            {METRICS.map((m) => (
              <details key={m.name} style={{ borderTop: "1px solid #ddd", padding: "8px 0" }}>
                <summary>
                  <b>{m.name}</b> <small style={{ color: "#666" }}>· {m.description}</small>
                </summary>
                <pre style={{ background: "#f6f6f6", padding: 8, overflowX: "auto" }}>
                  {JSON.stringify(m.fn(start, end), null, 2)}
                </pre>
              </details>
            ))}
          </section>
        );
      })}
    </main>
  );
}
