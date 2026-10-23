import { Fraunces, Inter, JetBrains_Mono, Lato } from "next/font/google";

/* Shared by both root layouts - Studio's and Livio's - so the two apps set
   type identically and the fonts are only declared once. */

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

/** Body text for live notes - rendered (`.prose-notes`) and while actually
 *  typing (`.editor-raw`), both in globals.css. */
const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

/** For <html className>. */
export const fontVariables = `${inter.variable} ${fraunces.variable} ${mono.variable} ${lato.variable}`;
