import "./globals.css";
import type { Metadata } from "next";
import { SiteNav } from "../components/site-nav";

export const metadata: Metadata = {
  title: "Unified Jewish-Christian Text Library",
  description: "Metadata-first corpus publication for Jewish and Christian writings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
