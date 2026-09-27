"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/require-auth";
import { api, ApiError, assetUrl } from "@/lib/api";
import type { PosterSummary, TemplateSummary } from "@/lib/types";

const OCCASION_LABELS: Record<string, string> = {
  victory: "বিজয়",
  tribute: "শ্রদ্ধাঞ্জলি",
  campaign: "প্রচার",
  greeting: "শুভেচ্ছা",
  festival: "উৎসব",
};

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [posters, setPosters] = useState<PosterSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    // Every state update lives in a promise callback rather than in the effect
    // body. Updating state synchronously while mounting forces a cascading
    // render, and React's lint rules flag it for good reason.
    Promise.all([
      api.listTemplates(),
      api.listPosters(1, 12, controller.signal),
    ])
      .then(([templateList, posterPage]) => {
        setTemplates(templateList);
        setPosters(posterPage.posters);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof ApiError ? caught.message : "তথ্য আনা যায়নি।");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ড্যাশবোর্ড</h1>
          <p className="mt-1.5 text-neutral-600">
            একটি টেমপ্লেট বেছে নিয়ে নতুন পোস্টার তৈরি করুন, অথবা আগের পোস্টারগুলো দেখুন।
          </p>
        </div>
        <Link href="/posters/new" className="btn-primary">
          নতুন পোস্টার তৈরি করুন
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">টেমপ্লেট</h2>
        {loading ? (
          <p className="mt-4 text-neutral-500">লোড হচ্ছে…</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="card overflow-hidden">
                <Link
                  href={`/posters/new?template=${template.slug}`}
                  className="group block focus-visible:outline-none"
                >
                  <div className="aspect-[3/4] overflow-hidden bg-neutral-100">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        Thumbnails are served by the API, not next/image's
                        optimiser, and the origin is configured at runtime. */}
                    <img
                      src={assetUrl(template.thumbnailUrl) ?? ""}
                      alt={template.title}
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{template.title}</h3>
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                        {OCCASION_LABELS[template.occasionType] ?? template.occasionType}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-neutral-600">
                      {template.description}
                    </p>
                    <p className="mt-2.5 text-xs text-neutral-500">
                      {template.photoSlotCount}টি ছবি · {template.canvas.width}×
                      {template.canvas.height}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">আমার পোস্টার</h2>
        {loading ? (
          <p className="mt-4 text-neutral-500">লোড হচ্ছে…</p>
        ) : posters.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <p className="text-neutral-600">এখনো কোনো পোস্টার তৈরি হয়নি।</p>
            <Link href="/posters/new" className="btn-primary mt-4">
              প্রথম পোস্টারটি তৈরি করুন
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {posters.map((poster) => (
              <li key={poster.id} className="card overflow-hidden">
                <Link href={`/posters/${poster.id}`} className="group block">
                  <div className="grid aspect-[3/4] place-items-center overflow-hidden bg-neutral-100">
                    {poster.outputUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={assetUrl(poster.outputUrl) ?? ""}
                        alt={poster.headline}
                        className="h-full w-full object-contain transition group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-sm text-neutral-500">তৈরি হচ্ছে…</span>
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="line-clamp-2 text-sm font-medium">{poster.headline}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {new Date(poster.createdAt).toLocaleString("bn-BD")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
