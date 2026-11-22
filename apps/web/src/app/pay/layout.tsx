import { Noto_Sans_Bengali } from "next/font/google";

// Bengali is only used on the checkout page. Loading it on every page made the rest of the site wait on a large font.
const bangla = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600", "700"], variable: "--font-bangla", display: "swap" });

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return <div className={bangla.variable}>{children}</div>;
}
