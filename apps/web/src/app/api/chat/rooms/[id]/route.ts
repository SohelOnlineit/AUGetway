import { proxyChat } from "@/lib/chat/proxy";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyChat(`/chat/rooms/${id}`);
}
