import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Heading-only display face (Phase 6 redesign) — bold geometric sans in the same
// family as the Gilroy face competitors use. Body copy stays on Geist Sans; only
// h1-h3 (see globals.css) pick this up. Self-hosted (the variable-weight Latin
// file, OFL — see fonts/PlusJakartaSans-OFL.txt) rather than via next/font/google:
// Google serves this family to some build hosts as /l/font?kit=…&skey=… URLs,
// and Turbopack's font loader can't resolve a URL containing "&", which failed
// every CI build.
const plusJakarta = localFont({
  src: "./fonts/PlusJakartaSans-latin-variable.woff2",
  variable: "--font-heading",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ovigo — Local Experts, Hosts & Stays",
  description: "Discover destinations, book local experts, tours and stays with Ovigo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans antialiased">
        <Providers>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
