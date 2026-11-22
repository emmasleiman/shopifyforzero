import { resolvePeriod, storeToday } from "@/lib/dates";
import { METRICS } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default function Home() {
  const today = storeToday();
  const { start, end } = resolvePeriod("last_week", today);
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Store metrics — last week</h1>
      <p>
        Store today: <b>{today}</b>. Last week resolves to <b>{start}</b> through <b>{end}</b> (Monday–Sunday,
        inclusive).
      </p>
      {METRICS.map((m) => (
        <section key={m.name} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}>
          <h3 style={{ margin: 0 }}>
            {m.name} <small style={{ fontWeight: 400, color: "#666" }}>· {m.dateBasis}</small>
          </h3>
          <p style={{ margin: "4px 0", color: "#555" }}>{m.description}</p>
          <pre style={{ background: "#f6f6f6", padding: 8, overflowX: "auto" }}>
            {JSON.stringify(m.fn(start, end), null, 2)}
          </pre>
        </section>
      ))}
    </main>
  );
}
