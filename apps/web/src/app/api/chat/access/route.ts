import { proxyChat } from "@/lib/chat/proxy";

export function GET() {
  return proxyChat("/chat/access");
}
