"use client";

/**
 * Chart components. Each one draws exactly the data the metric function
 * returned (via chartSpec), never numbers from the model's text.
 */
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money, pct, type ChartKind, type ChartSpec, type RepeatPoint, type SalesPoint } from "@/lib/chartSpec";
import type { ProductVelocity } from "@/lib/metrics";

const axis = { fontSize: 12, fill: "var(--muted)" };
const tooltipStyle = { background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 };

export function ChartView({ spec }: { spec: ChartSpec }) {
  const cls = spec.kind === "card-trend" ? "line" : spec.kind;
  return (
    <figure className={`chart chart-${cls === "empty" ? "card" : cls}`} aria-label={spec.title}>
      <figcaption className="chart-title">{spec.title}</figcaption>
      {spec.kind === "line" && <SalesLine points={spec.points} />}
      {spec.kind === "bar" && <VelocityBars rows={spec.rows} />}
      {spec.kind === "table" && <ReturnsTable spec={spec} />}
      {spec.kind === "card" && <RepeatCard {...spec.value} />}
      {spec.kind === "card-trend" && <RepeatTrend points={spec.points} />}
      {spec.kind === "empty" && <p className="chart-empty">{spec.message}</p>}
    </figure>
  );
}

function SalesLine({ points }: { points: SalesPoint[] }) {
  return (
    <>
    <div className="legend" aria-hidden>
      <span><i style={{ background: "var(--accent)" }} />Net sales</span>
      <span><i style={{ background: "var(--accent-2)" }} />Gross sales</span>
    </div>
    <ResponsiveContainer width="100%" height={226}>
      <LineChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tick={axis} width={52} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [money(Number(v)), name === "netSales" ? "Net sales" : "Gross sales"]}
          labelFormatter={(_, p) => {
            const d = p?.[0]?.payload as SalesPoint | undefined;
            return d ? (d.start === d.end ? d.label : `${d.start} to ${d.end}`) + ` · ${d.orders} orders` : "";
          }}
        />
        <Line type="linear" name="Gross sales" dataKey="grossSales" stroke="var(--accent-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="linear" name="Net sales" dataKey="netSales" stroke="var(--accent)" strokeWidth={2.5} dot={points.length <= 31 ? { r: 2.5 } : false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
    </>
  );
}

function VelocityBars({ rows }: { rows: ProductVelocity[] }) {
  const top = rows.slice(0, 10);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={axis} allowDecimals />
        <YAxis type="category" dataKey="title" tick={axis} width={150} interval={0} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--surface)" }}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as ProductVelocity | undefined) : undefined;
            if (!r) return null;
            return (
              <div style={{ ...tooltipStyle, padding: 8 }}>
                <b>{r.title}</b>
                <div>{r.netUnitsPerDay} net units / day</div>
                <div>Sold {r.unitsSold} · returned {r.unitsReturned} · net {r.netUnits}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="netUnitsPerDay" fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReturnsTable({ spec }: { spec: Extract<ChartSpec, { kind: "table" }> }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Product</th><th>Reason</th><th className="num">Units</th><th className="num">Refunded</th></tr>
        </thead>
        <tbody>
          {spec.rows.map((r) => (
            <tr key={`${r.productId}-${r.reason}`}>
              <td>{r.title}</td><td>{r.reason}</td><td className="num">{r.units}</td><td className="num">{money(r.refunded)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}>Total</td><td className="num">{spec.total.units}</td><td className="num">{money(spec.total.refunded)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

function RepeatCard({ share, repeatOrders, orders }: { share: number; repeatOrders: number; orders: number }) {
  return (
    <div>
      <div className="metric">{pct(share)}</div>
      <div className="metric-sub">{repeatOrders} of {orders} orders came from customers who had ordered before</div>
    </div>
  );
}

function RepeatTrend({ points }: { points: RepeatPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axis} />
        <YAxis tick={axis} width={44} domain={[0, 1]} tickFormatter={(v: number) => pct(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(_, __, item) => {
            const p = item.payload as RepeatPoint;
            return [`${pct(p.share)} (${p.repeatOrders} of ${p.orders} orders)`, "Repeat share"];
          }}
        />
        <Line type="linear" dataKey="share" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Placeholder in the shape of the chart that's coming, at the same size. */
export function ChartSkeleton({ kind, caption }: { kind: ChartKind; caption?: string }) {
  const cls = kind === "card-trend" ? "line" : kind;
  return (
    <figure className={`chart chart-${cls}`} aria-busy="true">
      <span className="sr-only" role="status">Loading</span>
      <figcaption className="chart-title">{caption ?? "Loading…"}</figcaption>
      {kind === "line" || kind === "card-trend" ? (
        <svg width="100%" height="250" viewBox="0 0 400 250" preserveAspectRatio="none" aria-hidden>
          <polyline className="sk" points="0,200 60,170 120,185 180,120 240,140 300,90 360,110 400,70" fill="none" stroke="var(--skeleton)" strokeWidth="6" />
        </svg>
      ) : kind === "bar" ? (
        <div aria-hidden style={{ display: "grid", gap: 12, paddingTop: 4 }}>
          {[92, 74, 60, 48, 40, 30, 22].map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="sk" style={{ width: 120, height: 12 }} />
              <div className="sk" style={{ width: `${w}%`, maxWidth: "calc(100% - 130px)", height: 22 }} />
            </div>
          ))}
        </div>
      ) : kind === "table" ? (
        <div aria-hidden style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk" style={{ height: 22, opacity: i === 0 ? 0.7 : 1 }} />)}
        </div>
      ) : (
        <div aria-hidden>
          <div className="sk" style={{ width: 120, height: 40, marginBottom: 10 }} />
          <div className="sk" style={{ width: "70%", height: 14 }} />
        </div>
      )}
    </figure>
  );
}
