/**
 * The chat answer as a UI message stream: one metric tool call, plus a single
 * forced retry when the model writes tool-call markup as text instead of
 * calling the tool. Kept out of the route file so it can be tested with a mock model.
 */
import {
  createUIMessageStream,
  streamText,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from "ai";
import { markupToolName, type chatSettings } from "./chat";

// Never leak provider details or keys; give the merchant something they can act on.
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate.?limit|free-models-per-day|429/i.test(msg)) {
    return "The free AI model has hit its request limit for now. Please try again later. The dashboard page still works without it.";
  }
  return "Something went wrong answering that. Please try again.";
}

const OPEN = "<tool_call";

/**
 * Holds back text that starts like "<tool_call" so the merchant never sees raw
 * markup, and records whether it happened. Normal text passes through after
 * its first few characters.
 */
function holdToolMarkup() {
  let raw = "";
  const transform = () => {
    let buf = "";
    let mode: "undecided" | "pass" | "drop" = "undecided";
    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(part, ctl) {
        if (part.type === "text-start") {
          buf = "";
          mode = "undecided";
        }
        if (part.type === "text-end" && mode === "undecided" && buf) {
          ctl.enqueue({ type: "text-delta", id: part.id, text: buf });
        }
        if (part.type !== "text-delta" || mode === "pass") return ctl.enqueue(part);
        if (mode === "drop") {
          raw += part.text;
          return;
        }
        buf += part.text;
        const t = buf.trimStart();
        if (t.startsWith(OPEN)) {
          mode = "drop";
          raw += buf;
          return;
        }
        if (OPEN.startsWith(t)) return; // could still become markup
        mode = "pass";
        ctl.enqueue({ ...part, text: buf });
      },
    });
  };
  return { transform, markup: () => raw };
}

export function chatStream(s: ReturnType<typeof chatSettings>, modelMessages: ModelMessage[]) {
  return createUIMessageStream({
    onError: friendlyError,
    execute: async ({ writer }) => {
      const hold = holdToolMarkup();
      const first = streamText({ ...s, messages: modelMessages, experimental_transform: hold.transform });
      let called = false;
      for await (const chunk of first.toUIMessageStream({ sendFinish: false, onError: friendlyError })) {
        if (chunk.type === "tool-input-start" || chunk.type === "tool-input-available") called = true;
        writer.write(chunk);
      }
      const meant = called ? undefined : markupToolName(hold.markup(), Object.keys(s.tools));
      if (!meant) {
        writer.write({ type: "finish" });
        return;
      }
      // The model wrote markup instead of calling the tool: retry once with that tool forced.
      // No tool ran in the first attempt, so this is still the question's only tool call.
      const retry = streamText({ ...s, messages: modelMessages, toolChoice: { type: "tool", toolName: meant } as never });
      writer.merge(retry.toUIMessageStream({ sendStart: false, onError: friendlyError }));
    },
  });
}
