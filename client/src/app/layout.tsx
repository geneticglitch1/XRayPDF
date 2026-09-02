import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
      </Providers>
    </html>
  );
}
