import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  applicationName: "TrueMerit",
  title: {
    default: "TrueMerit — Merit decides. Not connections.",
    template: "%s · TrueMerit",
  },
  description:
    "AI-assisted recruitment platform: objective CV + video-interview analysis, transparent evidence-backed ranking, and full candidate transparency. The AI assists — humans decide.",
  keywords: ["recruitment", "AI hiring", "interview analysis", "candidate ranking", "transparency", "merit"],
  // Google Search Console site ownership verification
  verification: {
    google: "oeDfPU047d5Lk5H24rfTv4vU2PEvHqSo0VTYtD4FUUU",
  },
  openGraph: {
    title: "TrueMerit — Merit decides. Not connections.",
    description:
      "Objective, evidence-backed hiring: AI-assisted CV and video-interview analysis with full transparency for candidates and the CEO.",
    siteName: "TrueMerit",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06090f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster
          richColors
          position="top-center"
          toastOptions={{
            style: {
              background: "#0d141f",
              border: "1px solid rgba(148,163,184,0.18)",
              color: "#e9eef6",
            },
          }}
        />
      </body>
    </html>
  );
}
