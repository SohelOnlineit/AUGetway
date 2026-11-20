import { proxyChat } from "@/lib/chat/proxy";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyChat(`/chat/rooms/${id}/messages`, { method: "POST", body });
}
