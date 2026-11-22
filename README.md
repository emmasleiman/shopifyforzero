# Shopify merchant analytics chat (Zero University case project)

Merchants ask questions about their store in plain language ("jakets returnd last wk"). A Claude model, called through OpenRouter, answers each question with **exactly one metric tool call over exact dates**. The answer is streamed back.

The project is built on the Shopify order history for May to October 2025. Read **[NOTES.md](NOTES.md)** for the decisions behind it.

## Setup

```bash
npm install
cp .env.example .env.local      # then paste your OpenRouter key into OPENROUTER_API_KEY
npm run dev                     # http://localhost:3000/chat
```

Get a key at openrouter.ai → **Keys**. Create one for this project and give it a credit limit. Only the server reads the key, in `src/lib/chat.ts`. It isn't `NEXT_PUBLIC_`, so it never reaches the browser, and `.env.local` is git-ignored.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Tests the metrics, the date rule, the tools and the one-call guard. Needs no key. |
| `npm run check:questions` | Runs all 30 merchant questions through the real model and writes `reports/question-check.md`: the tool, dates and filter for each question, plus pass/fail spot checks. Needs the key. |
| `npm run build` | Production build. |

## How it works

### The four metrics

These are in `src/lib/metrics.ts`:

1. **Sales by day:** counted on the order date. Can be grouped by week or month.
2. **Product velocity:** net units sold per day.
3. **Returns by product and reason:** counted on the **return date**.
4. **Repeat customer share:** the share of orders from customers who had ordered before. Can be grouped by week or month.

### The tools

The tools are in `src/lib/chat.ts`. Each description uses the words merchants actually typed in `data/merchant_questions.json`.

- **"Came back" goes to the right tool.** Products that came back are returns. People who came back are repeat customers.
- **Category words are mapped.** Jackets, coats, parkas and puffers all mean the Outerwear category.

### Exact dates

- **The server owns the dates.**
  - The model passes `period: "last_week" | "this_month"`, and the server turns it into exact dates with the tested `resolvePeriod`.
  - For any other phrase the model passes an explicit `start` and `end`, using date anchors given in the system prompt.
- **Every tool result echoes the dates it used,** and every answer starts with them.
- **Ranges outside the data are rejected.** The order history covers 2025-05-01 to today, and the model relays the error.

### One question, one tool call

Three layers enforce it:

1. Parallel tool calls are off.
2. The chat route allows at most 2 steps. Step 2 has tools switched off, so it can only answer.
3. The tool guard refuses any second call in the same request.

### No data, no tool

Some questions ask about ad spend, ROAS, inventory or dates before May 2025. The model says the data is missing instead of guessing.

## Layout

- `data/orders.csv`: the order export, one row per line item
- `data/merchant_report_requests_oct27.xlsx` and `data/merchant_questions.json`: the 30 merchant questions
- `src/lib/orders.ts`, `dates.ts`, `metrics.ts`: the loader, the date rule and the four metrics
- `src/lib/chat.ts`: the tools, the system prompt and the model settings
- `src/app/api/chat/route.ts`: the streaming chat route
- `src/app/chat/page.tsx`: the chat UI
- `src/app/api/metrics/route.ts`: the metrics as plain JSON, with no model
- `scripts/check-questions.ts`: the 30-question check
