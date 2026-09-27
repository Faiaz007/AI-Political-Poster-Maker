'use client';

import { useRef, useState } from 'react';
import { api, ApiError, assetUrl } from '@/lib/api';
import type { UploadedPhoto } from '@/lib/types';

const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const MIN_EDGE = 200;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Reads the intrinsic size of a File, so we can reject tiny images before uploading. */
function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ছবিটি পড়া যায়নি'));
    };
    image.src = url;
  });
}

function validate(file: File, dimension: { width: number; height: number }): string | null {
  if (!ACCEPTED.includes(file.type)) return 'শুধুমাত্র JPG, PNG বা WebP ছবি দেওয়া যাবে।';
  if (file.size > MAX_BYTES) return 'প্রতিটি ছবি ১০ MB-এর মধ্যে হতে হবে।';
  if (Math.min(dimension.width, dimension.height) < MIN_EDGE) {
    return `ছবির ছোট দিক কমপক্ষে ${MIN_EDGE} পিক্সেল হতে হবে।`;
  }
  return null;
}

export function PhotoUploader({
  photos,
  onChange,
  maxPhotos,
}: {
  photos: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  /** The template decides how many slots it has; respect that, not just the cap. */
  maxPhotos: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = Math.min(MAX_FILES, maxPhotos);

  async function onSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset immediately so re-picking the same file still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
    if (files.length === 0) return;

    setError(null);

    if (photos.length + files.length > limit) {
      setError(`সর্বোচ্চ ${limit}টি ছবি দেওয়া যাবে।`);
      return;
    }

    setBusy(true);
    const accepted: UploadedPhoto[] = [];
    try {
      // Validate every file before uploading any, so a bad file in the middle of
      // a batch does not leave the user with a half-applied selection.
      const dims = await Promise.all(files.map(readDimensions));
      for (const [index, file] of files.entries()) {
        const problem = validate(file, dims[index]);
        if (problem) throw new Error(problem);
      }

      const uploaded = await api.uploadPhotos(files);
      accepted.push(...uploaded);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : (caught as Error).message);
    } finally {
      if (accepted.length > 0) onChange([...photos, ...accepted]);
      setBusy(false);
    }
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="field-label mb-0">ছবি</span>
        <span className="text-sm text-neutral-500">
          {photos.length}/{limit}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <div key={photo.publicId} className="relative overflow-hidden rounded-lg border border-neutral-200">
            <div className="aspect-[3/4] bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(photo.url) ?? ""}
                alt={`আপলোড করা ছবি ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-xs text-white hover:bg-black/85"
              aria-label={`ছবি ${index + 1} সরান`}
            >
              ✕
            </button>
          </div>
        ))}

        {photos.length < limit ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="grid aspect-[3/4] place-items-center rounded-lg border-2 border-dashed border-neutral-300 text-sm text-neutral-500 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
          >
            <span>{busy ? 'আপলোড হচ্ছে…' : '+ ছবি যোগ করুন'}</span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        onChange={onSelect}
        className="sr-only"
        aria-label="ছবি নির্বাচন করুন"
      />

      {error ? <p className="field-error">{error}</p> : null}
      <p className="mt-1.5 text-sm text-neutral-500">
        সর্বোচ্চ {limit}টি, প্রতিটি ১০ MB পর্যন্ত। ছোট দিকে অন্তত {MIN_EDGE} পিক্সেল।
      </p>
    </div>
  );
}
