import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";

export async function POST() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const me = await apiFetchWithAccessToken("/admin/me", token);
  if (!me.ok) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: me.status === 401 ? 401 : 403 },
    );
  }

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
