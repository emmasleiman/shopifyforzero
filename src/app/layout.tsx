import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter_Tight, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Three voices, as in an editorial report: a tight grotesk for headlines and numbers,
// a serif for explanatory copy, and a mono for labels, axes and captions.
const sans = Inter_Tight({ variable: "--font-sans", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Store Analytics",
  description: "Ask about sales, best-sellers, returns and repeat customers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
