import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { chatSettings } from "@/lib/chat";

export const maxDuration = 30;

/**
 * POST /api/chat  { messages: UIMessage[] }
 * Streams the answer. Each question gets at most one metric tool call with
 * exact, server-resolved dates (see src/lib/chat.ts).
 */
export async function POST(req: Request) {
  let settings;
  try {
    settings = chatSettings();
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    ...settings,
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
