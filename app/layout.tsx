import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hyderabad Mega Property Expo 2027",
  description: "Registration, digital passes and exhibitor management.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
