import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Styling Studio",
  description: "Describe yourself and your style, get an AI model wearing shoppable outfit recommendations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
