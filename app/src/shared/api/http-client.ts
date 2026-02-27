import { env } from '@/shared/config/env';

export class HttpError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, payload: unknown, message?: string) {
    super(message ?? 'Request failed');
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

const withBaseUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${env.apiBaseUrl}${normalizedPath}`;
};

const parseResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
};

const request = async <TResponse>(
  method: string,
  path: string,
  body?: unknown,
): Promise<TResponse> => {
  const response = await fetch(withBaseUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new HttpError(response.status, payload);
  }

  return payload as TResponse;
};

export const httpClient = {
  get: <TResponse>(path: string): Promise<TResponse> => request<TResponse>('GET', path),
  post: <TResponse>(path: string, body: unknown): Promise<TResponse> =>
    request<TResponse>('POST', path, body),
  patch: <TResponse>(path: string, body: unknown): Promise<TResponse> =>
    request<TResponse>('PATCH', path, body),
};
