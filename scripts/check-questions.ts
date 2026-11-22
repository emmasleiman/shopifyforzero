/**
 * Runs all 30 merchant questions through the same model, tools and settings
 * as /api/chat, and writes a log of which tool and dates each one used.
 *
 *   npm run check:questions        (needs OPENROUTER_API_KEY in .env.local)
 *
 * Output: reports/question-check.md
 */
import { generateText } from "ai";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { chatSettings, type ResolvedScope } from "../src/lib/chat";
import { storeToday } from "../src/lib/dates";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

interface Q { requestId: string; question: string }
const questions: Q[] = JSON.parse(readFileSync("data/merchant_questions.json", "utf8"));

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

async function main() {
  const today = storeToday();
  const rows: string[] = [];
  let failures = 0;
  let multiCall = 0;

  for (const q of questions) {
    const calls: { name: string; scope: ResolvedScope; input: unknown }[] = [];
    const settings = chatSettings({ today, onCall: (name, scope, input) => calls.push({ name, scope, input }) });
    let answer = "";
    try {
      const r = await generateText({ ...settings, prompt: q.question });
      answer = r.text.replace(/\s+/g, " ").trim();
      if (r.steps.flatMap((s) => s.toolCalls).length > 1) multiCall++;
    } catch (e) {
      answer = `ERROR: ${(e as Error).message}`;
    }
    const c = calls[0];
    const exp = EXPECT[q.requestId];
    let verdict = "";
    if (exp) {
      const ok =
        (exp.tool === null ? calls.length === 0 : c?.name === exp.tool) &&
        (!exp.start || c?.scope.start === exp.start) &&
        (!exp.end || c?.scope.end === exp.end) &&
        (!exp.category || c?.scope.category === exp.category);
      verdict = ok ? "PASS" : "FAIL";
      if (!ok) failures++;
    }
    const cell = (s: string) => s.replace(/\|/g, "\\|");
    rows.push(
      `| ${q.requestId.slice(-4)} | ${cell(q.question)} | ${c ? `\`${c.name}\`` : "_no tool_"} | ${c?.scope.start ? `${c.scope.start} → ${c.scope.end}` : ""} | ${[c?.scope.category, c?.scope.product].filter(Boolean).join(", ")} | ${verdict} | ${cell(answer.slice(0, 220))}${answer.length > 220 ? "…" : ""} |`,
    );
    console.log(`${verdict.padEnd(4)} ${q.requestId}  ${c ? c.name : "(no tool)"}  ${c?.scope.start ?? ""}..${c?.scope.end ?? ""}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/question-check.md",
    `# 30-question check\n\nModel: \`${process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5.5"}\` · store today: ${today} · run ${new Date().toISOString()}\n\n` +
      `Spot checks failed: **${failures}** · questions with more than one tool call: **${multiCall}**\n\n` +
      `| # | Merchant question | Tool | Dates | Filter | Check | Answer (start) |\n|---|---|---|---|---|---|---|\n` +
      rows.join("\n") + "\n",
  );
  console.log(`\nWrote reports/question-check.md. Spot-check failures: ${failures}. Multi-call questions: ${multiCall}.`);
  if (failures || multiCall) process.exitCode = 1;
}

main();
