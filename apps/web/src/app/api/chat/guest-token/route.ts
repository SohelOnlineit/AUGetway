import { proxyChat } from "@/lib/chat/proxy";

export function POST() {
  return proxyChat("/chat/guest-token", { method: "POST" });
}
