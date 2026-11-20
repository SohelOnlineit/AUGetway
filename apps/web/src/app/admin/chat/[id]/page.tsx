"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminChatRoomRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/chat?room=${encodeURIComponent(params.id)}`);
  }, [params.id, router]);

  return null;
}
