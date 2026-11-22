import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "AU-Getway",
  description: "Merchant checkout desk for AU-Getway.",
};

const themeBoot = `(function(){try{var pref=localStorage.getItem("uniqpay_theme");var light=pref==="LIGHT";var root=document.documentElement;root.setAttribute("data-theme",light?"light":"dark");root.style.colorScheme=light?"light":"dark";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
      </body>
    </html>
  );
}
