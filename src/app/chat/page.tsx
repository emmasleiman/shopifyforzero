"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";

const EXAMPLES = [
  "which jackets came back as returns last week",
  "what sold best this season? want to reorder before bfcm",
  "sales per day last 14 days",
  "repeat customer share by month",
];

export default function Chat() {
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const ask = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <main style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1>Ask about your store</h1>
      <p style={{ color: "#555" }}>
        Sales, best-sellers, returns and repeat customers. Each question runs one metric with exact dates.
      </p>

      {messages.map((m) => (
        <div key={m.id} style={{ margin: "16px 0" }}>
          <b>{m.role === "user" ? "You" : "Assistant"}</b>
          {m.parts.map((p, i) => {
            if (p.type === "text") return <p key={i} style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>{p.text}</p>;
            if (p.type.startsWith("tool-") && "input" in p) {
              const inp = p.input as Record<string, unknown> | undefined;
              const out = (p as { output?: { dates?: { start: string; end: string } } }).output;
              return (
                <div key={i} style={{ fontSize: 13, color: "#666", background: "#f4f4f4", padding: "4px 8px", borderRadius: 4 }}>
                  ran <code>{p.type.slice(5)}</code>
                  {out?.dates ? ` for ${out.dates.start} to ${out.dates.end}` : ""}
                  {inp?.category ? ` · ${String(inp.category)}` : ""}
                </div>
              );
            }
            return null;
          })}
        </div>
      ))}
      {error && <p style={{ color: "crimson" }}>Something went wrong: {error.message}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. jakets returnd last wk"
          style={{ flex: 1, padding: 10, fontSize: 16 }}
        />
        <button disabled={busy} style={{ padding: "10px 16px" }}>
          {busy ? "…" : "Ask"}
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {EXAMPLES.map((q) => (
          <button key={q} onClick={() => ask(q)} disabled={busy} style={{ fontSize: 13 }}>
            {q}
          </button>
        ))}
      </div>
    </main>
  );
}
