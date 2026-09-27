"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  {
    title: "লেখা হুবহু থাকে",
    body: "আপনার বাংলা লেখা যেভাবে দিয়েছেন ঠিক তেমনই পোস্টারে থাকে — কোনো বানান বদল বা অনুবাদ হয় না।",
  },
  {
    title: "ছবি বসানোর সিদ্ধান্ত স্বয়ংক্রিয়",
    body: "উপলক্ষ অনুযায়ী রঙ, ফন্টের আকার ও সাজসজ্জা বেছে নেওয়া হয়, তবে প্রতিটি অক্ষর আপনারই থাকে।",
  },
  {
    title: "পছন্দ না হলে আবার তৈরি করুন",
    body: "একই লেখা রেখে শুধু সাজান্দা বদলে নতুন সংস্করণ বানান — পুরোনো ছবিই সংরক্ষিত থাকে।",
  },
];

export default function HomePage() {
  const { user, initialising } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">
            বাংলাদেশের জন্য তৈরি
          </span>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
            মুহূর্তেই প্রচারের পোস্টার তৈরি করুন
          </h1>
          <p className="mt-5 text-lg text-neutral-600">
            ছবি ও লেখা দিন, টেমপ্লেট বেছে নিন — সাজসজ্জা নিজে থেকেই ঠিক হয়ে যাবে।
            লেখা কখনো বদলায় না, তাই আপনি আস্থা রাখতে পারেন।
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!initialising && !user ? (
              <>
                <Link href="/register" className="btn-primary px-6 py-3 text-base">
                  ফ্রি অ্যাকাউন্ট খুলুন
                </Link>
                <Link href="/login" className="btn-secondary px-6 py-3 text-base">
                  লগইন করুন
                </Link>
              </>
            ) : (
              <Link href={user ? "/posters/new" : "/login"} className="btn-primary px-6 py-3 text-base">
                পোস্টার তৈরি শুরু করুন
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="card p-6">
            <h2 className="text-lg font-semibold">{feature.title}</h2>
            <p className="mt-2 text-neutral-600">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
