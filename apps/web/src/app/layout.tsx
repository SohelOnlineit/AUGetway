import type { Metadata } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "UniqBD Pay",
  description: "Merchant checkout desk for UniqBD.",
};

const themeBoot = `(function(){try{var pref=localStorage.getItem("uniqpay_theme");var dark=pref==="DARK"||(pref!=="LIGHT"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.setAttribute("data-theme",dark?"dark":"light");root.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

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
