/**
 * Erik Vogt's acceptance run: asks the 20 questions in
 * data/acceptance_questions.xlsx against a LIVE deployment, exactly as the
 * chat page does (streaming POST /api/chat), and fills in the sheet.
 *
 *   BASE_URL=https://<preview>.vercel.app npm run acceptance
 *
 * Optional: VERCEL_BYPASS=<token> if the preview has Deployment Protection on.
 *
 * Writes:
 *   reports/acceptance_results.xlsx  Erik's sheet with the empty columns filled
 *   reports/acceptance.md            readable summary against the pass thresholds
 *   reports/acceptance.json          raw results (lets a rerun skip finished rows)
 *
 * "Seconds To First Chart" = time from sending the question until the tool
 * result (the chart's data) arrives in the stream. For out-of-scope questions,
 * where no chart should appear, it is the time until the first answer text.
 */
import ExcelJS from "exceljs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chartSpec, type ToolOutput } from "../src/lib/chartSpec";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SHEET_IN = "data/acceptance_questions.xlsx";
const SHEET_OUT = "reports/acceptance_results.xlsx";
const JSON_OUT = "reports/acceptance.json";
const MD_OUT = "reports/acceptance.md";
const PAUSE_MS = Number(process.env.CHECK_PAUSE_MS ?? 3000);
const DEFAULT = { start: "2025-09-27", end: "2025-10-26" };

interface Row {
  id: string; question: string; metric: string; dateWording: string; expectedRange: string; filter: string; expected: string;
}
interface Result {
  id: string; question: string;
  tool: string | null; args: unknown; output?: ToolOutput;
  answer: string; seconds: number | null; rendered: boolean; correct: boolean; why: string; error?: string;
}

const TOOL_FOR_METRIC: Record<string, string[]> = {
  Sales: ["sales_by_day"],
  "Top Products": ["product_velocity"],
  Returns: ["returns_by_product_and_reason"],
  "Repeat Customers": ["repeat_customer_share"],
};

// ------------------------------------------------------------ judging

function judge(row: Row, r: Omit<Result, "correct" | "why">): { correct: boolean; why: string } {
  if (r.error) return { correct: false, why: `request failed: ${r.error}` };
  if (row.metric === "Out of Scope") {
    return r.tool === null
      ? { correct: true, why: "no tool called; no-data message" }
      : { correct: false, why: `called ${r.tool} for an out-of-scope question` };
  }
  // AQ-05 asks for sales AND returns: one correct chart for either is a pass.
  const allowed = row.id === "AQ-05" ? ["sales_by_day", "returns_by_product_and_reason"] : TOOL_FOR_METRIC[row.metric] ?? [];
  if (!r.tool) return { correct: false, why: "no tool called" };
  if (!allowed.includes(r.tool)) return { correct: false, why: `wrong tool ${r.tool}` };

  const d = r.output?.dates;
  if (!d) return { correct: false, why: "tool returned no dates (error?)" };
  const want = /\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}/.test(row.expectedRange)
    ? { start: row.expectedRange.slice(0, 10), end: row.expectedRange.slice(12, 22) }
    : DEFAULT;
  if (d.start !== want.start || d.end !== want.end) {
    return { correct: false, why: `dates ${d.start}..${d.end}, expected ${want.start}..${want.end}` };
  }

  const f = r.output?.filters ?? {};
  const a = (r.args ?? {}) as { groupBy?: string; product?: string; category?: string; channel?: string };
  const filter = row.filter.toLowerCase();
  const filterOk =
    filter === "none" ? true
    : filter.includes("jackets") ? f.category === "Outerwear"
    : filter.startsWith("channel: point of sale") ? a.groupBy === "channel" || !!f.channel
    : filter.startsWith("channel: online store") ? f.channel === "Online Store"
    : filter.includes("sweaters") ? f.category === "Knitwear" || /sweater/i.test(f.product ?? "")
    : filter.includes("beanies") ? f.category === "Accessories" || /beanie|scar/i.test(`${a.product ?? ""} ${f.product ?? ""}`)
    : filter.includes("hoodies") ? /hood/i.test(a.product ?? "")
    : filter.includes("boots") ? /boot/i.test(a.product ?? "")
    : true;
  if (!filterOk) return { correct: false, why: `filter not applied (${row.filter}); got ${JSON.stringify(f)}` };
  return { correct: true, why: "right tool, dates and filter" };
}

// ------------------------------------------------------------ one question over the live stream

async function ask(question: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.VERCEL_BYPASS) headers["x-vercel-protection-bypass"] = process.env.VERCEL_BYPASS;
  const t0 = performance.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [{ id: "q1", role: "user", parts: [{ type: "text", text: question }] }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);

  let tool: string | null = null;
  let args: unknown = undefined;
  let output: ToolOutput | undefined;
  let answer = "";
  let tChart: number | null = null;
  let tText: number | null = null;
  let streamError: string | undefined;

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let ev: Record<string, unknown>;
      try { ev = JSON.parse(data); } catch { continue; }
      const now = (performance.now() - t0) / 1000;
      switch (ev.type) {
        case "tool-input-available":
          if (!tool) { tool = String(ev.toolName); args = ev.input; }
          break;
        case "tool-output-available":
          if (!output) { output = ev.output as ToolOutput; tChart ??= now; }
          break;
        case "tool-output-error":
          streamError ??= String(ev.errorText ?? "tool error");
          break;
        case "text-delta":
          answer += String(ev.delta ?? "");
          tText ??= now;
          break;
        case "error":
          streamError ??= String(ev.errorText ?? "stream error");
          break;
      }
    }
  }
  return { tool, args, output, answer: answer.trim(), tChart, tText, streamError };
}

// ------------------------------------------------------------ main

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET_IN);
  const ws = wb.getWorksheet("Acceptance Questions")!;
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
  const col = (name: string) => header.indexOf(name);
  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const v = (name: string) => String(r.getCell(col(name)).value ?? "").trim();
    rows.push({
      id: v("Question ID"), question: v("Question Text"), metric: v("Metric Asked About"), dateWording: v("Date Wording"),
      expectedRange: v("Expected Date Range"), filter: v("Filter Mentioned"), expected: v("Expected Behaviour"),
    });
  });

  mkdirSync("reports", { recursive: true });
  const fresh = process.argv.includes("--fresh");
  const results: Result[] = !fresh && existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, "utf8")) : [];
  console.log(`Running ${rows.length} questions against ${BASE_URL}\n`);

  for (const row of rows) {
    const prev = results.find((r) => r.id === row.id);
    if (prev && !prev.error) continue;
    let base: Omit<Result, "correct" | "why">;
    try {
      const r = await ask(row.question);
      // Would the page render without crashing? Build the chart exactly as the page does.
      let rendered = !r.streamError;
      try {
        if (r.tool && r.output) chartSpec(r.tool, r.output);
      } catch {
        rendered = false;
      }
      if (!r.tool && !r.answer) rendered = false; // blank answer counts as a failure to render
      const outOfScope = row.metric === "Out of Scope";
      base = {
        id: row.id, question: row.question, tool: r.tool, args: r.args, output: r.output, answer: r.answer,
        seconds: outOfScope || !r.tool ? r.tText : r.tChart, rendered,
        error: r.streamError?.match(/rate.?limit/i) ? r.streamError : undefined,
      };
    } catch (e) {
      base = { id: row.id, question: row.question, tool: null, args: null, answer: "", seconds: null, rendered: false, error: (e as Error).message };
    }
    const res: Result = { ...base, ...judge(row, base) };
    const i = results.findIndex((x) => x.id === row.id);
    if (i >= 0) results[i] = res; else results.push(res);
    writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
    console.log(
      `${row.id}  ${res.correct ? "Y" : "N"}  ${res.rendered ? "render ok" : "RENDER FAIL"}  ${res.seconds?.toFixed(2) ?? "-"}s  ${res.tool ?? "(no tool)"}  ${res.output?.dates ? `${res.output.dates.start}..${res.output.dates.end}` : ""}  ${res.correct ? "" : "· " + res.why}`,
    );
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  // Fill Erik's sheet.
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const res = results.find((x) => x.id === String(r.getCell(col("Question ID")).value));
    if (!res) return;
    r.getCell(col("Tool Called")).value = res.tool ?? "none (no-data message)";
    r.getCell(col("Arguments Sent")).value = res.args ? JSON.stringify(res.args) : "{}";
    r.getCell(col("Correct Call (Y/N)")).value = res.error ? "" : res.correct ? "Y" : "N";
    r.getCell(col("Rendered Without Crash (Y/N)")).value = res.error ? "" : res.rendered ? "Y" : "N";
    r.getCell(col("Seconds To First Chart")).value = res.seconds === null ? "" : Math.round(res.seconds * 100) / 100;
  });
  await wb.xlsx.writeFile(SHEET_OUT);

  // Summary against the thresholds.
  const done = results.filter((r) => !r.error);
  const correct = done.filter((r) => r.correct).length;
  const crashes = done.filter((r) => !r.rendered).length;
  const times = done.map((r) => r.seconds).filter((s): s is number => s !== null);
  const slow = done.filter((r) => r.seconds === null || r.seconds >= 5);
  const max = times.length ? Math.max(...times) : NaN;
  const pass = (ok: boolean) => (ok ? "✅ PASS" : "❌ FAIL");
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const md =
    `# Acceptance run: Erik Vogt's 20 questions\n\n` +
    `- Live URL: ${BASE_URL}\n- Model: \`${process.env.OPENROUTER_MODEL_LABEL ?? "see README (Model choice)"}\`\n` +
    `- Store today: 2025-10-27 · team default range: ${DEFAULT.start} → ${DEFAULT.end}\n- Run: ${new Date().toISOString()}\n` +
    `- Completed: **${done.length}/${rows.length}**\n\n` +
    `| Measure | Threshold | Result | |\n|---|---|---|---|\n` +
    `| Tool call accuracy | ≥ 18 of 20 Y | **${correct} of ${done.length}** | ${pass(done.length === rows.length && correct >= 18)} |\n` +
    `| Render crash rate | 0 N | **${crashes}** | ${pass(crashes === 0)} |\n` +
    `| Time to first chart | < 5.0 s on every question | **max ${Number.isFinite(max) ? max.toFixed(2) : "-"} s**, ${slow.length} at or over 5 s | ${pass(done.length > 0 && slow.length === 0)} |\n\n` +
    `| ID | Question | Tool | Dates | Args | Correct | Rendered | Seconds | Note |\n|---|---|---|---|---|---|---|---|---|\n` +
    rows.map((row) => {
      const r = results.find((x) => x.id === row.id);
      if (!r) return `| ${row.id} | ${cell(row.question)} | _not run_ | | | | | | |`;
      const d = r.output?.dates ? `${r.output.dates.start} → ${r.output.dates.end}${r.output.dates.source === "default" ? " (default)" : ""}` : "";
      return `| ${row.id} | ${cell(row.question)} | ${r.tool ? `\`${r.tool}\`` : "_none_"} | ${d} | \`${cell(JSON.stringify(r.args ?? {}))}\` | ${r.error ? "" : r.correct ? "Y" : "N"} | ${r.error ? "" : r.rendered ? "Y" : "N"} | ${r.seconds?.toFixed(2) ?? ""} | ${cell(r.error ? `ERROR: ${r.error.slice(0, 120)}` : r.correct ? r.answer.slice(0, 140) : r.why)} |`;
    }).join("\n") + "\n";
  writeFileSync(MD_OUT, md);
  console.log(`\nWrote ${SHEET_OUT}, ${MD_OUT}. Correct ${correct}/${done.length}, crashes ${crashes}, max ${max.toFixed?.(2)}s.`);
  if (done.length < rows.length) console.log("Some questions errored (often the free model's rate limit). Run again to finish them.");
}

main();
