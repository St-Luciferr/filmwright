import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Videos — prompt to rendered video",
  description: "Generate HyperFrames videos from a prompt.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="top">
            <h1>
              <a href="/">videos</a>
            </h1>
            <span className="sub">prompt → hyperframes → mp4</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
