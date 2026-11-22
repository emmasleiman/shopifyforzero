/**
 * Runs all 30 merchant questions through the same model, tools and settings
 * as /api/chat, and writes a log of which tool and dates each one used.
 *
 *   npm run check:questions        (needs OPENROUTER_API_KEY in .env.local)
 *
 * Output: reports/question-check.md (readable log) and
 *         reports/question-check.json (raw results, used to resume).
 *
 * Free OpenRouter models are rate-limited, so the script paces itself and
 * saves after every question. If it stops on a limit, run it again later:
 * it skips questions that already have an answer. Use --fresh to start over.
 */
import { generateText } from "ai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chatSettings, DEFAULT_MODEL, type ResolvedScope } from "../src/lib/chat";
import { storeToday } from "../src/lib/dates";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

interface Q { requestId: string; question: string }
interface Result {
  requestId: string;
  question: string;
  toolCalls: { name: string; start: string; end: string; category?: string; product?: string; input: unknown }[];
  answer: string;
  error?: string;
}

const questions: Q[] = JSON.parse(readFileSync("data/merchant_questions.json", "utf8"));
const JSON_OUT = "reports/question-check.json";
const MD_OUT = "reports/question-check.md";
const PAUSE_MS = Number(process.env.CHECK_PAUSE_MS ?? 4000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Spot checks the brief calls out. Every other question is logged for review.
const EXPECT: Record<string, { tool: string | null; start?: string; end?: string; category?: string }> = {
  "CRR-25-10-27-0043": { tool: "returns_by_product_and_reason", start: "2025-10-20", end: "2025-10-26", category: "Outerwear" },
  "CRR-25-10-27-0174": { tool: "returns_by_product_and_reason", start: "2025-10-20", end: "2025-10-26", category: "Outerwear" },
  "CRR-25-10-27-0158": { tool: null }, // ROAS: no ad data
  "CRR-25-10-27-0490": { tool: null }, // ad spend: no ad data
  "CRR-25-10-27-0266": { tool: null }, // last year's Black Friday: outside the data
  "CRR-25-10-27-0318": { tool: "repeat_customer_share" },
  "CRR-25-10-27-0561": { tool: "repeat_customer_share" },
  "CRR-25-10-27-0352": { tool: "product_velocity" },
};

function verdict(r: Result): "" | "PASS" | "FAIL" {
  const exp = EXPECT[r.requestId];
  if (!exp || r.error) return "";
  const c = r.toolCalls[0];
  const ok =
    (exp.tool === null ? r.toolCalls.length === 0 : c?.name === exp.tool) &&
    (!exp.start || c?.start === exp.start) &&
    (!exp.end || c?.end === exp.end) &&
    (!exp.category || c?.category === exp.category);
  return ok ? "PASS" : "FAIL";
}

function writeReport(results: Result[], model: string, today: string) {
  const done = results.filter((r) => !r.error);
  const fails = results.filter((r) => verdict(r) === "FAIL").length;
  const multi = results.filter((r) => r.toolCalls.length > 1).length;
  const noTool = done.filter((r) => r.toolCalls.length === 0).length;
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const rows = questions.map((q) => {
    const r = results.find((x) => x.requestId === q.requestId);
    if (!r) return `| ${q.requestId.slice(-4)} | ${cell(q.question)} | _not run yet_ | | | | |`;
    const c = r.toolCalls[0];
    const text = r.error ? `ERROR: ${r.error}` : r.answer;
    return `| ${q.requestId.slice(-4)} | ${cell(q.question)} | ${c ? `\`${c.name}\`` : "_no tool_"} | ${c?.start ? `${c.start} → ${c.end}` : ""} | ${[c?.category, c?.product].filter(Boolean).join(", ")} | ${verdict(r)} | ${cell(text.slice(0, 240))}${text.length > 240 ? "…" : ""} |`;
  });
  writeFileSync(
    MD_OUT,
    `# 30-question check\n\n` +
      `- Model: \`${model}\` via OpenRouter\n- Store today: ${today}\n- Last run: ${new Date().toISOString()}\n` +
      `- Answered: **${done.length}/${questions.length}** · tool calls made: **${done.length - noTool}** · no tool (missing data): **${noTool}**\n` +
      `- Questions with more than one tool call: **${multi}**\n` +
      `- Spot checks: **${Object.keys(EXPECT).length - fails}/${Object.keys(EXPECT).length} pass** (questions marked PASS/FAIL)\n\n` +
      `| # | Merchant question | Tool | Dates | Filter | Check | Answer (start) |\n|---|---|---|---|---|---|---|\n` +
      rows.join("\n") + "\n",
  );
  return { done: done.length, fails, multi };
}

async function main() {
  const today = storeToday();
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  mkdirSync("reports", { recursive: true });
  const fresh = process.argv.includes("--fresh");
  const results: Result[] = !fresh && existsSync(JSON_OUT) ? JSON.parse(readFileSync(JSON_OUT, "utf8")) : [];

  // --report-only rebuilds the Markdown log from saved results without calling the model.
  for (const q of process.argv.includes("--report-only") ? [] : questions) {
    const prev = results.find((r) => r.requestId === q.requestId);
    if (prev && !prev.error) continue;

    const calls: Result["toolCalls"] = [];
    const settings = chatSettings({
      today,
      onCall: (name, s: ResolvedScope, input) =>
        calls.push({ name, start: s.start, end: s.end, category: s.category, product: s.product, input }),
    });
    const r: Result = { requestId: q.requestId, question: q.question, toolCalls: calls, answer: "" };
    try {
      const out = await generateText({ ...settings, prompt: q.question, maxRetries: 3 });
      r.answer = out.text.trim();
      // Count calls the model attempted too, including any the guard refused.
      const attempted = out.steps.flatMap((s) => s.toolCalls).length;
      if (attempted > calls.length) r.toolCalls.push(...Array(attempted - calls.length).fill({ name: "(refused)", start: "", end: "", input: null }));
    } catch (e) {
      r.error = (e as Error).message.slice(0, 300);
    }
    const i = results.findIndex((x) => x.requestId === q.requestId);
    if (i >= 0) results[i] = r;
    else results.push(r);
    writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
    const c = r.toolCalls[0];
    console.log(`${(verdict(r) || "    ").padEnd(4)} ${q.requestId}  ${r.error ? "ERROR " + r.error.slice(0, 80) : c ? `${c.name} ${c.start}..${c.end}` : "(no tool)"}`);
    await sleep(PAUSE_MS);
  }

  const s = writeReport(results, model, today);
  console.log(`\nWrote ${MD_OUT}. Answered ${s.done}/${questions.length}. Spot-check failures: ${s.fails}. Multi-call questions: ${s.multi}.`);
  if (s.done < questions.length) console.log("Some questions hit errors (often the free model's rate limit). Run again later to finish them.");
  if (s.fails || s.multi) process.exitCode = 1;
}

main();
