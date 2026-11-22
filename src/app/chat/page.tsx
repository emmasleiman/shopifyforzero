import { storeToday } from "@/lib/dates";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return <ChatClient today={storeToday()} />;
}
