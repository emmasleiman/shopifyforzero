"use client";

import { useChat } from "@ai-sdk/react";
import Link from "next/link";
import { useState } from "react";
import { ChartSkeleton, ChartView } from "@/components/Charts";
import { formatRange } from "@/lib/chartSpec";
import { partView } from "@/lib/loadingState";

const EXAMPLES = [
  "which jackets came back as returns last week",
  "what sold best this season? want to reorder before bfcm",
  "sales per day last 14 days",
  "repeat customer share by month",
];

export default function ChatClient({ today }: { today: string }) {
  const { messages, sendMessage, status, error, stop } = useChat();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const ask = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };
  const last = messages[messages.length - 1];

  return (
    <main className="page">
      <nav className="nav">
        <Link href="/chat" aria-current="page">Ask</Link>
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      <h1>Ask about your store</h1>
      <p className="sub">
        Sales, best-sellers, returns and repeat customers from your May–October 2025 orders. Each question runs one
        metric with exact dates. Today is {formatRange(today, today)}.
      </p>

      {messages.map((m) => (
        <div key={m.id} className="msg">
          <div className="msg-role">{m.role === "user" ? "You" : "Assistant"}</div>
          {m.parts.map((p, i) => {
            if (p.type === "text") return p.text ? <p key={i} className="msg-text">{p.text}</p> : null;
            if (!p.type.startsWith("tool-") || !("state" in p)) return null;
            const view = partView(p.type.slice(5), p.state ?? "","input" in p ? p.input : undefined, "output" in p ? p.output : undefined, today);
            if (view.show === "skeleton") return <ChartSkeleton key={i} kind={view.kind} caption={view.caption} />;
            if (view.show === "chart") return <ChartView key={i} spec={view.spec} />;
            return null;
          })}
        </div>
      ))}

      {/* Stage 1: sent, before the model has picked a tool. */}
      {status === "submitted" && last?.role === "user" && (
        <p className="status" role="status">Reading your question…</p>
      )}
      {error && <p className="err">Something went wrong: {error.message}</p>}

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          aria-label="Your question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. jakets returnd last wk"
        />
        {busy ? (
          <button type="button" className="btn btn-secondary" onClick={() => stop()}>Stop</button>
        ) : (
          <button className="btn" disabled={!input.trim()}>Ask</button>
        )}
      </form>
      <div className="chips">
        {EXAMPLES.map((q) => (
          <button key={q} className="chip" onClick={() => ask(q)} disabled={busy}>{q}</button>
        ))}
      </div>
    </main>
  );
}
