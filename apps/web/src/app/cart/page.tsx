import { redirect } from "next/navigation";
import type { PublicCart } from "@amarpin/types";
import { CartScreen } from "@/components/commerce/CartScreen";
import { shopperFetch } from "@/lib/auth/shopper";

export default async function CartPage() {
  const { upstream } = await shopperFetch("/cart");
  if (upstream.status === 401 || upstream.status === 403) redirect("/login?next=/cart");
  if (!upstream.ok) {
    return <p className="form-error">Unable to load cart</p>;
  }
  const cart = (await upstream.json()) as PublicCart;
  return <CartScreen initial={cart} />;
}
