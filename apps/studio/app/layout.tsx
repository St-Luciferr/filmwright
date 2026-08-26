import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "filmwright",
    template: "%s · filmwright",
  },
  description: "Describe a video. Get a rendered video.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
