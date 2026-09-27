import type {
  OccasionType,
  PaginatedPosters,
  PosterCopy,
  PosterSummary,
  TemplateSummary,
  UploadedPhoto,
  User,
} from './types';

/**
 * The API base URL. `NEXT_PUBLIC_` values are inlined at build time, so this must
 * be a literal that can be replaced by the deployment, not a runtime lookup.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:5000';

/**
 * Turns a relative asset path from the API into something the browser can load.
 *
 * The API deliberately stores relative paths (`/uploads/...`) so that switching
 * between local disk and Cloudinary does not rewrite the database. The
 * browser, however, has no idea where the API lives.
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

const TOKEN_KEY = 'poster_generator_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** A single, predictable error shape for the whole app to render. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thrown when the server rejects our token. The auth provider listens for this
 * to sign the user out, so an expired session cannot leave the UI in a
 * permanently broken signed-in state.
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, auth = true, signal } = options;

  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  // Content-Type is deliberately omitted for FormData: the browser must set it
  // itself so the multipart boundary is correct.
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });

  if (response.status === 204) return undefined as T;

  let payload: { success?: boolean; data?: T; message?: string; errors?: Array<{ field: string; message: string }> };
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means something between us and the server failed
    // (a proxy timeout or a crash), so there is nothing useful to show.
    throw new ApiError('The server could not be reached. Please try again.', response.status);
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Broadcast rather than importing the auth provider, which would create a
      // cycle: api.ts -> auth.tsx -> api.ts. Any 401 means the session is gone,
      // so every screen needs to know.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('poster:unauthorized'));
      }
      throw new UnauthorizedError(payload.message);
    }
    throw new ApiError(payload.message ?? 'Request failed', response.status, payload.errors);
  }

  return payload.data as T;
}

export const api = {
  async register(name: string, email: string, password: string) {
    const data = await request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    });
    setToken(data.token);
    return data.user;
  },

  async login(email: string, password: string) {
    const data = await request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    setToken(data.token);
    return data.user;
  },

  async logout() {
    clearToken();
  },

  me(signal?: AbortSignal) {
    return request<{ user: User }>('/api/auth/me', { signal }).then((d) => d.user);
  },

  async listTemplates(occasion?: OccasionType) {
    const query = occasion ? `?occasion=${occasion}` : '';
    const data = await request<{ templates: TemplateSummary[] }>(`/api/templates${query}`, { auth: false });
    return data.templates;
  },

  getTemplate(id: string) {
    return request<{ template: TemplateSummary }>(`/api/templates/${id}`, { auth: false }).then((d) => d.template);
  },

  async uploadPhotos(files: File[], signal?: AbortSignal) {
    const formData = new FormData();
    for (const file of files) {
      // The API accepts either `photos` or `photos[]`; this uses the plain key.
      formData.append('photos', file);
    }
    const data = await request<{ photos: UploadedPhoto[] }>('/api/upload', {
      method: 'POST',
      formData,
      signal,
    });
    return data.photos;
  },

  async createPoster(templateSlug: string, copy: PosterCopy, photoPublicIds: string[]) {
    const data = await request<{ poster: PosterSummary }>('/api/posters', {
      method: 'POST',
      body: { templateSlug, copy, photoPublicIds },
    });
    return data.poster;
  },

  getPoster(id: string, signal?: AbortSignal) {
    return request<{ poster: PosterSummary }>(`/api/posters/${id}`, { signal }).then((d) => d.poster);
  },

  listPosters(page = 1, limit = 12, signal?: AbortSignal) {
    return request<PaginatedPosters>(`/api/posters?page=${page}&limit=${limit}`, { signal });
  },

  async regenerate(id: string) {
    const data = await request<{ poster: PosterSummary }>(`/api/posters/${id}/regenerate`, {
      method: 'POST',
      body: {},
    });
    return data.poster;
  },

  deletePoster(id: string) {
    return request<void>(`/api/posters/${id}`, { method: 'DELETE' });
  },
};
