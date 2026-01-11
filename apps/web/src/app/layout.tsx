import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "¡Piensa Rápido! - Think Fast!",
  description: "Real-time multiplayer game",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

