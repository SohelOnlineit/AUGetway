import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PublicCart, PublicProfile, PublicWallet } from "@amarpin/types";
import { CheckoutScreen } from "@/components/commerce/CheckoutScreen";
import { apiFetchWithAccessToken } from "@/lib/auth/api-client";
import { ACCESS_COOKIE } from "@/lib/auth/constants";
import { shopperFetch } from "@/lib/auth/shopper";

export default async function CheckoutPage() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const [{ upstream }, profileResponse, walletResponse] = await Promise.all([
    shopperFetch("/cart"),
    apiFetchWithAccessToken("/account/profile", token),
    apiFetchWithAccessToken("/wallet", token),
  ]);
  if (upstream.status === 401 || upstream.status === 403) redirect("/login?next=/checkout");
  if (!upstream.ok) {
    return <p className="form-error">Unable to load cart for checkout</p>;
  }
  const cart = (await upstream.json()) as PublicCart;
  const profile = profileResponse.ok ? ((await profileResponse.json()) as PublicProfile) : null;
  const wallet = walletResponse.ok ? ((await walletResponse.json()) as PublicWallet) : null;
  return (
    <CheckoutScreen initialCart={cart} initialProfile={profile} initialWallet={wallet} />
  );
}
