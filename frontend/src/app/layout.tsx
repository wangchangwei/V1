import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "December - Your Personal Full Stack Engineer",
  description:
    "Idea to app in seconds, with your personal full stack engineer. Build, deploy, and manage containerized applications with AI assistance.",
  keywords: [
    "AI",
    "full stack",
    "development",
    "containers",
    "Next.js",
    "deployment",
    "coding assistant",
  ],
  authors: [{ name: "December" }],
  creator: "December",
  publisher: "December",
  openGraph: {
    title: "December - Your Personal Full Stack Engineer",
    description:
      "Idea to app in seconds, with your personal full stack engineer",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "December - Your Personal Full Stack Engineer",
    description:
      "Idea to app in seconds, with your personal full stack engineer",
  },
  robots: {
    index: true,
    follow: true,
  },
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning={true} lang="en">
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Toaster
          position="top-right"
          toastOptions={{
            className: "bg-gray-800 text-white",
            style: {
              fontFamily: "var(--font-geist-sans)",
              fontSize: "14px",
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
