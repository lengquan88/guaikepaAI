import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://deepseek-v4.edgeone.site/"),
  title: "DeepSeek V4 Playground – AI Code Generator",
  description:
    "Experience the latest DeepSeek V4 model - generate small apps with one prompt. Powered by EdgeOne Pages Edge AI.",
  keywords: ["DeepSeek", "AI Code Generator", "DeepSeek V4", "EdgeOne Pages", "AI Playground", "React"],
  authors: [{ name: "EdgeOne Pages" }],
  creator: "EdgeOne Pages",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "32x32" },
    ],
  },
  openGraph: {
    type: "website",
    title: "DeepSeek V4 Playground – AI Code Generator",
    description:
      "Experience the latest DeepSeek V4 model - generate small apps with one prompt. Powered by EdgeOne Pages Edge AI.",
    siteName: "DeepSeek V4 Playground",
    url: "https://deepseek-v4.edgeone.site/",
  },
  twitter: {
    card: "summary_large_image",
    title: "DeepSeek V4 Playground – AI Code Generator",
    description: "Experience the latest DeepSeek V4 model - generate small apps with one prompt.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="antialiased bg-brand min-h-screen text-white">{children}</body>
    </html>
  );
}
