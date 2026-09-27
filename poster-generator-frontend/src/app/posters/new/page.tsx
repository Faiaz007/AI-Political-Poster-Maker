'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PhotoUploader } from '@/components/photo-uploader';
import { RequireAuth } from '@/components/require-auth';
import { api, ApiError } from '@/lib/api';
import type { PosterCopy, TemplateSummary, UploadedPhoto } from '@/lib/types';

/** Mirrors the server-side Bangla length limits so the user sees them before submitting. */
const OPTIONAL_FIELDS = [
  { key: 'subheadline', label: 'উপশিরোনাম', max: 120, rows: 2 },
  { key: 'name', label: 'নাম', max: 80, rows: 1 },
  { key: 'designation', label: 'পদবি', max: 120, rows: 1 },
  { key: 'organization', label: 'সংগঠন', max: 120, rows: 1 },
  { key: 'location', label: 'এলাকা', max: 120, rows: 1 },
  { key: 'contact', label: 'যোগাযোগ', max: 120, rows: 1 },
] as const;

const EMPTY_COPY: PosterCopy = {
  headline: '',
  subheadline: '',
  name: '',
  designation: '',
  organization: '',
  location: '',
  contact: '',
};

function NewPosterPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="mx-auto max-w-3xl px-4 py-16 text-neutral-500">লোড হচ্ছে…</p>}>
        <NewPosterForm />
      </Suspense>
    </RequireAuth>
  );
}

export default NewPosterPage;

function NewPosterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselected = searchParams.get('template');

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [slug, setSlug] = useState<string>(preselected ?? '');
  const [copy, setCopy] = useState<PosterCopy>(EMPTY_COPY);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listTemplates()
      .then((list) => {
        setTemplates(list);
        // Land on a sensible default so the form is never in a dead state.
        setSlug((current) => current || list[0]?.slug || '');
      })
      .catch(() => setError('টেমপ্লেট লোড করা যায়নি। পাতা রিফ্রেশ করুন।'));
    return () => controller.abort();
  }, []);

  const template = useMemo(
    () => templates.find((t) => t.slug === slug) ?? null,
    [templates, slug],
  );

  function setField<K extends keyof PosterCopy>(key: K, value: PosterCopy[K]) {
    setCopy((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!slug) {
      setError('একটি টেমপ্লেট বেছে নিন।');
      return;
    }
    if (!copy.headline.trim()) {
      setFieldErrors({ headline: 'শিরোনাম লিখুন।' });
      return;
    }

    setSubmitting(true);
    try {
      // Send only non-empty optional values so the API stores real text rather
      // than a row of empty strings. `OPTIONAL_FIELDS` is `as const`, so `key`
      // is a union of literal PosterCopy keys and this stays type-safe.
      const payload: PosterCopy = { headline: copy.headline.trim() };
      for (const { key } of OPTIONAL_FIELDS) {
        const value = copy[key];
        if (value && value.trim()) payload[key] = value.trim();
      }

      const poster = await api.createPoster(
        slug,
        payload,
        photos.map((photo) => photo.publicId),
      );
      router.push(`/posters/${poster.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        if (caught.fieldErrors) {
          setFieldErrors(
            Object.fromEntries(caught.fieldErrors.map((f) => [f.field, f.message])),
          );
        }
      } else {
        setError('পোস্টার তৈরি করা যায়নি। আবার চেষ্টা করুন।');
      }
      setSubmitting(false);
    }
  }

  const maxPhotos = template?.photoSlotCount ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">নতুন পোস্টার</h1>
      <p className="mt-1.5 text-neutral-600">
        লেখা ও ছবি দিন — বাকিটা সাজানোর কাজ আমরা করে দেব।
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        <section className="card p-5">
          <label htmlFor="template" className="field-label">
            টেমপ্লেট ও উপলক্ষ
          </label>
          <select
            id="template"
            className="field-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          >
            {templates.length === 0 ? <option value="">লোড হচ্ছে…</option> : null}
            {templates.map((option) => (
              <option key={option.id} value={option.slug}>
                {option.title} — {option.description}
              </option>
            ))}
          </select>
          {template ? (
            <p className="mt-2 text-sm text-neutral-500">
              {template.photoSlotCount > 0
                ? `এই টেমপ্লেটে সর্বোচ্চ ${template.photoSlotCount}টি ছবি বসানো যাবে।`
                : 'এই টেমপ্লেটে ছবি বসানোর স্লট নেই — শুধু লেখা থাকবে।'}
            </p>
          ) : null}
        </section>

        {maxPhotos > 0 ? (
          <section className="card p-5">
            <PhotoUploader photos={photos} onChange={setPhotos} maxPhotos={maxPhotos} />
          </section>
        ) : null}

        <section className="card space-y-4 p-5">
          <div>
            <label htmlFor="headline" className="field-label">
              শিরোনাম <span className="text-red-500">*</span>
            </label>
            <textarea
              id="headline"
              className="field-input"
              rows={2}
              maxLength={120}
              value={copy.headline}
              onChange={(e) => setField('headline', e.target.value)}
              required
            />
            <p className="mt-1 text-sm text-neutral-500">
              {copy.headline.length}/120 · এই লেখা হুবহু পোস্টারে থাকবে।
            </p>
            {fieldErrors.headline ? <p className="field-error">{fieldErrors.headline}</p> : null}
          </div>

          {OPTIONAL_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className="field-label">
                {field.label}
              </label>
              <textarea
                id={field.key}
                className="field-input"
                rows={field.rows}
                maxLength={field.max}
                value={copy[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            </div>
          ))}
        </section>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary px-6" disabled={submitting}>
            {submitting ? 'তৈরি হচ্ছে…' : 'পোস্টার তৈরি করুন'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/dashboard')}
            disabled={submitting}
          >
            বাতিল
          </button>
        </div>
      </form>
    </div>
  );
}
