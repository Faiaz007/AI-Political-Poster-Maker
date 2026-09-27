'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, UnauthorizedError } from '@/lib/api';
import type { PosterSummary } from '@/lib/types';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

interface UsePosterResult {
  poster: PosterSummary | null;
  error: string | null;
  loading: boolean;
  timedOut: boolean;
  refresh: () => void;
  setPoster: (poster: PosterSummary) => void;
}

/**
 * Loads a poster and keeps polling while the server is still working on it.
 *
 * Polling is driven by the status of the last fetch rather than by a fixed
 * number of attempts, so it self-rearms after a regenerate without the caller
 * having to restart anything. A hard timeout stops an indefinite poll if the
 * render ever wedges, rather than hammering the API forever.
 */
export function usePoster(id: string): UsePosterResult {
  const [poster, setPoster] = useState<PosterSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [nonce, setNonce] = useState(0);

  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    startedAt.current = Date.now();

    async function poll() {
      if (cancelled) return;

      if (startedAt.current !== null && Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        setLoading(false);
        return;
      }

      try {
        const next = await api.getPoster(id);
        if (cancelled) return;

        setPoster(next);
        setError(null);
        setTimedOut(false);
        setLoading(false);
        // Keep waiting only while the server still owes us an image.
        if (next.status === 'pending' || next.status === 'processing') {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof ApiError ? caught.message : 'পোস্টারটি আনা যায়নি।');
        setLoading(false);
        // 401 already signs the user out centrally; retrying would be pointless.
        if (!(caught instanceof UnauthorizedError)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, nonce]);

  const refresh = useCallback(() => {
    setLoading(true);
    setTimedOut(false);
    startedAt.current = null;
    setNonce((n) => n + 1);
  }, []);

  return { poster, error, loading, timedOut, refresh, setPoster };
}
