import type { Metadata, Viewport } from "next";
import { Hind_Siliguri } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Hind Siliguri is a Bangla-first UI face with proper conjunct shaping. Bundling
// it through next/font means no layout shift and no request to Google at runtime.
const hindSiliguri = Hind_Siliguri({
  variable: "--font-hind-siliguri",
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "পোস্টার তৈরি | Political Poster Generator",
    template: "%s | পোস্টার তৈরি",
  },
  description:
    "নির্বাচিত ছবি ও লেখা থেকে মুহূর্তেই প্রচারের পোস্টার তৈরি করুন — বাংলা লেখা অক্ষরে অক্ষরে হুবহু সংরক্ষিত থাকে।",
};

export const viewport: Viewport = {
  themeColor: "#0f644c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="bn" className={`${hindSiliguri.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
