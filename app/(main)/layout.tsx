import Header from "@/components/Header";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <body className="antialiased bg-brand min-h-screen">
      <div className="flex flex-col h-screen">
        <Header />
        {children}
      </div>
    </body>
  );
}
