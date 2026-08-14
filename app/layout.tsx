import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif4 = Source_Serif_4({
  variable: "--font-source-serif-4",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naprocs Tech",
  description: "Newsletter and articles from Naprocs Tech.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif4.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
