'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { api, ApiError, assetUrl } from '@/lib/api';
import { usePoster } from '@/lib/use-poster';

export default function PosterPage() {
  return (
    <RequireAuth>
      <PosterDetail />
    </RequireAuth>
  );
}

function PosterDetail() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { poster, error, loading, timedOut, refresh, setPoster } = usePoster(id);

  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const busy = poster?.status === 'pending' || poster?.status === 'processing';

  async function onRegenerate() {
    setActionError(null);
    setWorking(true);
    try {
      // The API bumps the version and restarts rendering; the polling hook sees
      // the new "processing" status and resumes on its own.
      setPoster(await api.regenerate(id));
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'আবার তৈরি করা যায়নি।');
    } finally {
      setWorking(false);
    }
  }

  async function onDelete() {
    setActionError(null);
    setWorking(true);
    try {
      await api.deletePoster(id);
      router.replace('/dashboard');
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : 'মুছে ফেলা যায়নি।');
      setWorking(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← সব পোস্টারে ফিরে যান
      </Link>

      {loading && !poster ? (
        <p className="mt-8 text-neutral-500">লোড হচ্ছে…</p>
      ) : error && !poster ? (
        <p role="alert" className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-red-700">
          {error}
        </p>
      ) : poster ? (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <div className="card grid place-items-center overflow-hidden bg-neutral-100 p-4">
              {poster.outputUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={assetUrl(poster.outputUrl) ?? ""}
                  alt={poster.headline}
                  className="max-h-[70vh] w-auto rounded shadow-sm"
                />
              ) : (
                <div className="grid aspect-[3/4] w-full max-w-sm place-items-center text-center">
                  <div>
                    <div
                      aria-hidden
                      className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-neutral-300 border-t-brand-600"
                    />
                    <p className="mt-4 text-neutral-600">
                      {poster.status === 'failed'
                        ? 'তৈরি করা যায়নি'
                        : 'পোস্টার তৈরি হচ্ছে…'}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      সাধারণত কয়েক সেকেন্ড লাগে। পাতা বন্ধ রাখলেও কাজ চলবে।
                    </p>
                  </div>
                </div>
              )}
            </div>

            {timedOut ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
                এটি অনেক সময় লাগছে।{" "}
                <button type="button" onClick={refresh} className="font-semibold underline">
                  আবার চেষ্টা করুন
                </button>
              </p>
            ) : null}

            {actionError ? (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">
                {actionError}
              </p>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold leading-snug">{poster.headline}</h1>
              {poster.subheadline ? (
                <p className="mt-1.5 text-neutral-600">{poster.subheadline}</p>
              ) : null}
            </div>

            <dl className="card divide-y divide-neutral-100 text-sm">
              <Row label="অবস্থা">
                <StatusBadge status={poster.status} />
              </Row>
              <Row label="সংস্করণ">#{poster.version}</Row>
              <Row label="উপলক্ষ">{poster.occasionType}</Row>
              <Row label="সাইজ">
                {poster.width} × {poster.height}
              </Row>
              {poster.generationMs !== null ? (
                <Row label="সময় লেগেছে">{(poster.generationMs / 1000).toFixed(1)} সেকেন্ড</Row>
              ) : null}
              <Row label="তৈরি করেছে">
                {poster.aiSource === 'gemini' ? 'Gemini' : poster.aiSource === 'fallback' ? 'নিয়ম অনুযায়ী' : '—'}
              </Row>
              <Row label="তৈরির সময়">
                {new Date(poster.createdAt).toLocaleString('bn-BD')}
              </Row>
            </dl>

            <div className="space-y-2">
              {poster.outputUrl ? (
                <a
                  href={assetUrl(poster.outputUrl) ?? '#'}
                  download
                  className="btn-primary w-full"
                >
                  ডাউনলোড করুন
                </a>
              ) : null}

              <button
                type="button"
                onClick={onRegenerate}
                disabled={working || busy}
                className="btn-secondary w-full"
              >
                {busy || working ? 'অপেক্ষা করুন…' : 'সাজান্দা বদলে আবার তৈরি'}
              </button>

              {confirmingDelete ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-800">সত্যিই মুছে ফেলবেন?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={working}
                      className="btn-danger flex-1"
                    >
                      {working ? 'মুছছে…' : 'হ্যাঁ, মুছুন'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="btn-secondary flex-1"
                      disabled={working}
                    >
                      থাক
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={working || busy}
                  className="btn-danger w-full"
                >
                  পোস্টার মুছে ফেলুন
                </button>
              )}
            </div>

            <p className="text-xs text-neutral-500">
              নতুন সাজান্দা তৈরি করলে লেখা ও ছবি একই থাকবে, শুধু সংস্করণ নম্বর বাড়বে।
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'অপেক্ষমাণ', className: 'bg-neutral-100 text-neutral-700' },
  processing: { label: 'তৈরি হচ্ছে', className: 'bg-amber-100 text-amber-800' },
  completed: { label: 'সম্পন্ন', className: 'bg-brand-100 text-brand-800' },
  failed: { label: 'ব্যর্থ', className: 'bg-red-100 text-red-700' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-700' };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
