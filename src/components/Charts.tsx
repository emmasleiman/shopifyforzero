"use client";

/**
 * Chart components. Each one draws exactly the data the metric function
 * returned (via chartSpec), never numbers from the model's text.
 *
 * Style: dotted fills, dashed grid, mono labels, and one orange highlight per
 * chart for the thing the merchant should look at first (top seller, biggest
 * channel, most-returned product, repeat orders). Everything else is neutral.
 */
import { useId } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money, pct, type ChartKind, type ChartSpec, type RepeatPoint, type SalesPoint } from "@/lib/chartSpec";
import type { ChannelSales, ProductVelocity } from "@/lib/metrics";

const axis = { fontSize: 11, fill: "var(--muted)" };
const grid = { stroke: "var(--grid)", strokeDasharray: "3 4" };
const tooltipStyle = {
  background: "var(--panel)", border: "1px solid var(--ink)", borderRadius: 0, fontSize: 13, color: "var(--ink)",
};

/** What each chart counts, printed under it like a source line. */
const NOTES: Record<ChartSpec["kind"], string> = {
  line: "Counted on the order date. Net = gross − discounts. Days with no orders show as $0.",
  bar: "Ranked by net units per day: (sold − returned) ÷ days in range. Top seller highlighted.",
  channels: "Net sales by channel, counted on the order date. Largest channel highlighted.",
  table: "Counted on the return date, not the order date. Most-returned product highlighted.",
  card: "Share of orders placed by customers who had ordered before. Repeat orders highlighted.",
  "card-trend": "Share of orders placed by customers who had ordered before.",
  empty: "",
};

const panelClass = (kind: ChartKind | "empty") =>
  kind === "card-trend" ? "line" : kind === "channels" ? "bar" : kind === "empty" ? "card" : kind;

export function ChartView({ spec }: { spec: ChartSpec }) {
  return (
    <figure className={`chart chart-${panelClass(spec.kind)}`} aria-label={spec.title}>
      <figcaption className="chart-title">{spec.title}</figcaption>
      <div className="chart-body">
        {spec.kind === "line" && <SalesLine points={spec.points} />}
        {spec.kind === "bar" && <VelocityBars rows={spec.rows} />}
        {spec.kind === "channels" && <ChannelBars rows={spec.rows} />}
        {spec.kind === "table" && <ReturnsTable spec={spec} />}
        {spec.kind === "card" && <RepeatCard {...spec.value} />}
        {spec.kind === "card-trend" && <RepeatTrend points={spec.points} />}
        {spec.kind === "empty" && <p className="chart-empty">{spec.message}</p>}
      </div>
      {NOTES[spec.kind] && <p className="chart-note">{NOTES[spec.kind]}</p>}
    </figure>
  );
}

/** SVG dot patterns: a neutral one and the orange highlight. IDs are unique per chart. */
function usePatterns() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const defs = (
    <defs>
      {[
        ["n", "var(--neutral)", "var(--neutral-dot)"],
        ["a", "var(--accent)", "var(--accent-dot)"],
      ].map(([k, bg, dot]) => (
        <pattern key={k} id={`${id}${k}`} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" style={{ fill: bg }} />
          <circle cx="2.5" cy="2.5" r="0.75" style={{ fill: dot }} />
        </pattern>
      ))}
    </defs>
  );
  return { defs, neutral: `url(#${id}n)`, accent: `url(#${id}a)` };
}

/** A value in a small bordered box at the end of a bar, like a printed callout. */
function BoxLabel(props: { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown; format: (v: number) => string }) {
  const x = Number(props.x), y = Number(props.y), w = Number(props.width), h = Number(props.height);
  const text = props.format(Number(props.value));
  const bw = text.length * 6.8 + 12;
  const bx = x + Math.max(w, 0) + 6;
  const by = y + h / 2 - 10;
  return (
    <g>
      <rect x={bx} y={by} width={bw} height={20} style={{ fill: "var(--panel)", stroke: "var(--ink)" }} strokeWidth={1} />
      <text x={bx + 6} y={by + 14} className="box-label" style={{ fill: "var(--ink)", fontFamily: "var(--mono)", fontSize: 11 }}>{text}</text>
    </g>
  );
}

function SalesLine({ points }: { points: SalesPoint[] }) {
  return (
    <>
      <div className="legend" aria-hidden>
        <span><i style={{ borderColor: "var(--accent)" }} />Net sales</span>
        <span><i className="dashed" style={{ borderColor: "var(--faint)" }} />Gross sales</span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} vertical={false} />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink)" }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `$${v}`} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--ink)", strokeDasharray: "2 3" }}
            formatter={(v, name) => [money(Number(v)), name === "netSales" ? "Net sales" : "Gross sales"]}
            labelFormatter={(_, p) => {
              const d = p?.[0]?.payload as SalesPoint | undefined;
              return d ? (d.start === d.end ? d.label : `${d.start} to ${d.end}`) + ` · ${d.orders} orders` : "";
            }}
          />
          <Line type="linear" name="Gross sales" dataKey="grossSales" stroke="var(--faint)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line
            type="linear" name="Net sales" dataKey="netSales" stroke="var(--accent)" strokeWidth={2.5} isAnimationActive={false}
            dot={points.length <= 31 ? { r: 2.5, fill: "var(--accent)", stroke: "var(--accent)" } : false}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

function VelocityBars({ rows }: { rows: ProductVelocity[] }) {
  const top = rows.slice(0, 8);
  const p = usePatterns();
  return (
    <ResponsiveContainer width="100%" height={Math.max(250, top.length * 36 + 20)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={8}>
        {p.defs}
        <CartesianGrid {...grid} horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink)" }} allowDecimals />
        <YAxis type="category" dataKey="title" tick={axis} tickLine={false} axisLine={false} width={124} interval={0} />
        <Tooltip
          cursor={{ fill: "var(--accent-soft)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const r = active ? (payload?.[0]?.payload as ProductVelocity | undefined) : undefined;
            if (!r) return null;
            return (
              <div style={{ ...tooltipStyle, padding: 10 }}>
                <b>{r.title}</b>
                <div>{r.netUnitsPerDay} net units / day</div>
                <div>Sold {r.unitsSold} · returned {r.unitsReturned} · net {r.netUnits}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="netUnitsPerDay" isAnimationActive={false} stroke="var(--neutral-dot)" strokeWidth={1}>
          {top.map((r, i) => (
            <Cell key={r.productId} fill={i === 0 && r.netUnitsPerDay > 0 ? p.accent : p.neutral} stroke={i === 0 && r.netUnitsPerDay > 0 ? "var(--accent-dot)" : "var(--neutral-dot)"} />
          ))}
          <LabelList dataKey="netUnitsPerDay" content={(l) => <BoxLabel {...l} format={(v) => v.toFixed(2)} />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChannelBars({ rows }: { rows: ChannelSales[] }) {
  const p = usePatterns();
  const max = Math.max(...rows.map((r) => r.netSales));
  return (
    <ResponsiveContainer width="100%" height={Math.max(250, rows.length * 44 + 20)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 84, left: 0, bottom: 0 }} barCategoryGap={10}>
        {p.defs}
        <CartesianGrid {...grid} horizontal={false} />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink)" }} tickFormatter={(v: number) => `$${v}`} />
        <YAxis type="category" dataKey="channel" tick={axis} tickLine={false} axisLine={false} width={110} interval={0} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--accent-soft)", opacity: 0.4 }}
          formatter={(v, _n, item) => {
            const r = item.payload as ChannelSales;
            return [`${money(Number(v))} net · ${r.orders} orders`, r.channel];
          }}
        />
        <Bar dataKey="netSales" isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.channel} fill={r.netSales === max && max > 0 ? p.accent : p.neutral} stroke={r.netSales === max && max > 0 ? "var(--accent-dot)" : "var(--neutral-dot)"} />
          ))}
          <LabelList dataKey="netSales" content={(l) => <BoxLabel {...l} format={(v) => money(v)} />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ReturnsTable({ spec }: { spec: Extract<ChartSpec, { kind: "table" }> }) {
  // Highlight the product with the most units returned.
  const byProduct = new Map<string, number>();
  for (const r of spec.rows) byProduct.set(r.productId, (byProduct.get(r.productId) ?? 0) + r.units);
  const topId = [...byProduct.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr><th>Product</th><th>Reason</th><th className="num">Units</th><th className="num">Refunded</th></tr>
        </thead>
        <tbody>
          {spec.rows.map((r) => (
            <tr key={`${r.productId}-${r.reason}`} className={r.productId === topId ? "top" : undefined}>
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
      <div className="metric-sub">{repeatOrders} of {orders} orders came from customers who had ordered before.</div>
      {orders > 0 && orders <= 30 && (
        // One cell per order, so a small sample reads as a small sample.
        <div className="share-track" role="img" aria-label={`${repeatOrders} repeat orders out of ${orders}`}>
          {Array.from({ length: orders }, (_, i) => <i key={i} className={i < repeatOrders ? "on" : undefined} />)}
        </div>
      )}
    </div>
  );
}

function RepeatTrend({ points }: { points: RepeatPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={points} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "var(--ink)" }} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={[0, 1]} tickFormatter={(v: number) => pct(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(_, __, item) => {
            const p = item.payload as RepeatPoint;
            return [`${pct(p.share)} (${p.repeatOrders} of ${p.orders} orders)`, "Repeat share"];
          }}
        />
        <Line type="linear" dataKey="share" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)", stroke: "var(--accent)" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Placeholder in the shape of the chart that's coming, at the same size. */
export function ChartSkeleton({ kind, caption }: { kind: ChartKind; caption?: string }) {
  const shape = panelClass(kind);
  return (
    <figure className={`chart chart-${shape}`} aria-busy="true">
      <span className="sr-only" role="status">Loading</span>
      <figcaption className="chart-title">{caption ?? "Loading…"}</figcaption>
      <div className="chart-body">
        {shape === "line" ? (
          <svg width="100%" height="230" viewBox="0 0 400 230" preserveAspectRatio="none" aria-hidden>
            <polyline className="sk" points="0,190 60,160 120,175 180,110 240,130 300,80 360,100 400,60" fill="none" stroke="var(--skeleton)" strokeWidth="6" />
          </svg>
        ) : shape === "bar" ? (
          <div aria-hidden style={{ display: "grid", gap: 12, paddingTop: 4 }}>
            {[92, 74, 60, 48, 40, 30].map((w, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div className="sk" style={{ width: 120, height: 12 }} />
                <div className="sk" style={{ width: `${w}%`, maxWidth: "calc(100% - 130px)", height: 24 }} />
              </div>
            ))}
          </div>
        ) : shape === "table" ? (
          <div aria-hidden style={{ display: "grid", gap: 12 }}>
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk" style={{ height: 20, opacity: i === 0 ? 0.7 : 1 }} />)}
          </div>
        ) : (
          <div aria-hidden>
            <div className="sk" style={{ width: 160, height: 60, marginBottom: 14 }} />
            <div className="sk" style={{ width: "70%", height: 14 }} />
          </div>
        )}
      </div>
    </figure>
  );
}
