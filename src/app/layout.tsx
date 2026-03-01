import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RobotViz - 3D Robot Visualization",
  description:
    "Interactive 3D robot visualization with ROS joint state subscription",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jetbrainsMono.variable} font-mono antialiased overflow-hidden`}
      >
        <div className="h-screen flex overflow-hidden">
          <aside className="w-64 hidden sm:flex flex-col gap-6 p-4 bg-(--bg-secondary) text-(--text-primary) overflow-hidden">
            <div className="text-lg font-semibold">RobotViz</div>
            <nav className="flex flex-col gap-2">
              <Link
                href="/"
                className="px-3 py-2 rounded-md hover:bg-(--glass-bg)"
              >
                RViz
              </Link>
              <Link
                href="/nodes"
                className="px-3 py-2 rounded-md hover:bg-(--glass-bg)"
              >
                Nodes
              </Link>
            </nav>
            <div className="mt-auto text-xs text-zinc-400">v1.0</div>
          </aside>

          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
