import { proxyChat } from "@/lib/chat/proxy";

export function GET() {
  return proxyChat("/chat/rooms");
}

export function POST() {
  return proxyChat("/chat/rooms", { method: "POST" }, true);
}
