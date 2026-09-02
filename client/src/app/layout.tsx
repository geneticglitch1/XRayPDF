import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Providers  from "@/lib/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the landing page. High-contrast and editorial — it carries
// the headlines so the UI sans never has to pretend to be expressive.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "XRayPDF — Strip hidden text out of PDFs",
  description:
    "A PDF can carry text nobody sees and every machine reads: white ink on white paper, 0.5pt type, content parked off-page. XRayPDF surfaces it and exports a file with none of it left.",
  openGraph: {
    title: "XRayPDF — Strip hidden text out of PDFs",
    description:
      "Find the invisible text in a PDF, then download a flattened copy with no text layer left to hide in. Open source and self-hostable.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Providers>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        {children}
      </body>
      </Providers>
    </html>
  );
}
