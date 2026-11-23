"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartSkeleton, ChartView } from "@/components/Charts";
import { Colophon, Masthead } from "@/components/Masthead";
import { formatRange } from "@/lib/chartSpec";
import { partView } from "@/lib/loadingState";

const EXAMPLES = [
  "which jackets came back the most last week",
  "what sold best this season? want to reorder before bfcm",
  "whats my pos vs online split",
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
      <Masthead current="chat" />
      <section className="hero">
        <p className="eyebrow">Today is {formatRange(today, today)} · Orders May–Oct 2025</p>
        <h1 className="headline" style={{ marginTop: 10 }}>Ask your store anything.</h1>
        <p className="lede">
          Sales, best-sellers, returns or repeat customers, in your own words. Each answer runs one metric over exact
          dates and draws the chart from the real numbers.
        </p>
      </section>

      <div className="thread">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="turn">
              <p className="label">You asked</p>
              <p className="question">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
            </div>
          ) : (
            <div key={m.id}>
              {m.parts.map((p, i) => {
                if (p.type === "text")
                  return p.text ? (
                    <div key={i} className="answer">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                    </div>
                  ) : null;
                if (!p.type.startsWith("tool-") || !("state" in p)) return null;
                const view = partView(p.type.slice(5), p.state ?? "", "input" in p ? p.input : undefined, "output" in p ? p.output : undefined, today);
                if (view.show === "skeleton") return <ChartSkeleton key={i} kind={view.kind} caption={view.caption} />;
                if (view.show === "chart") return <ChartView key={i} spec={view.spec} />;
                return null;
              })}
            </div>
          ),
        )}

        {/* Stage 1: sent, before the model has picked a tool. */}
        {status === "submitted" && last?.role === "user" && (
          <p className="status" role="status">Reading your question</p>
        )}
        {error && <p className="err">Something went wrong: {error.message}</p>}
      </div>
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
      {messages.length === 0 && (
        <>
          <p className="label chips-label">Try one</p>
          <div className="chips">
            {EXAMPLES.map((q) => (
              <button key={q} className="chip" onClick={() => ask(q)} disabled={busy}>{q}</button>
            ))}
          </div>
        </>
      )}

      <Colophon />
    </main>
  );
}
