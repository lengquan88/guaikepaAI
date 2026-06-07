import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://deepseek-v4.edgeone.site/"),
  title: "DeepSeek V4 Playground – AI Code Generator",
  description: "Experience the latest DeepSeek V4 model - generate small apps with one prompt. Powered by EdgeOne Pages Edge AI.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "32x32" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      {children}
    </html>
  );
}
