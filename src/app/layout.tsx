import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PARK_ADDRESS, PARK_NAME } from "@/lib/park-details";

export const metadata: Metadata = {
  title: `GraveNav | ${PARK_NAME}`,
  description: `Find a gravesite at ${PARK_NAME}, ${PARK_ADDRESS}.`,
  icons: {
    icon: { url: "/forest-lake-logo.png", type: "image/png" },
    shortcut: "/forest-lake-logo.png",
    apple: "/forest-lake-logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-theme="light" lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="gravenav-theme",s=localStorage.getItem(k),t=s==="dark"?"dark":"light";document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--canvas)] antialiased">{children}</body>
    </html>
  );
}
