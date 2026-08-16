const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const fallbackProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const fallbackApiUrl = import.meta.env.PROD
  ? `${fallbackProtocol}//${hostname}/api`
  : `${fallbackProtocol}//${hostname}:3000/api`;
const API_URL = (import.meta.env.VITE_API_URL || fallbackApiUrl).replace(/\/$/, '');

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCESS_DENIED'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR'
  | string;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId?: string;
  readonly retryAfter?: number;

  constructor({
    message,
    status = 0,
    code = 'UNKNOWN_ERROR',
    requestId,
    retryAfter,
  }: {
    message: string;
    status?: number;
    code?: ApiErrorCode;
    requestId?: string;
    retryAfter?: number;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

// Restaurant-admin and SuperAdmin are deliberately separate session
// lifecycles. Restaurant auth uses its compatibility bearer; SuperAdmin auth
// uses an HttpOnly cookie that this client cannot read. The namespace only
// selects transport behavior and must never attach the restaurant token to a
// platform request. See ADR 0009.
export type TokenNamespace = 'restaurant' | 'superAdmin';

const TOKEN_STORAGE_KEYS: Record<TokenNamespace, string> = {
  restaurant: 'auth_token',
  superAdmin: 'superAdminToken',
};

export const tokenStore = {
  get(namespace: TokenNamespace): string | null {
    return namespace === 'superAdmin' ? null : localStorage.getItem(TOKEN_STORAGE_KEYS[namespace]);
  },
  set(namespace: TokenNamespace, token: string): void {
    if (namespace !== 'superAdmin') localStorage.setItem(TOKEN_STORAGE_KEYS[namespace], token);
  },
  clear(namespace: TokenNamespace): void {
    localStorage.removeItem(TOKEN_STORAGE_KEYS[namespace]);
    if (namespace === 'superAdmin') sessionStorage.removeItem(TOKEN_STORAGE_KEYS[namespace]);
  },
};

const getHeaders = (namespace: TokenNamespace = 'restaurant') => {
  const token = namespace === 'superAdmin' ? null : tokenStore.get(namespace);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const namespaceCredentials = (namespace: TokenNamespace): RequestCredentials | undefined =>
  namespace === 'superAdmin' ? 'include' : undefined;

const fallbackErrorCode = (status: number): ApiErrorCode => {
  if (status === 401) return 'AUTHENTICATION_REQUIRED';
  if (status === 403) return 'ACCESS_DENIED';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 400 && status < 500) return 'VALIDATION_ERROR';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN_ERROR';
};

const parseRetryAfter = (value: string | null) => {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
};

export const isUnauthenticatedError = (error: unknown): boolean =>
  error instanceof ApiError && (error.code === 'AUTHENTICATION_REQUIRED' || error.status === 401);

export const handleResponse = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let errorMsg = `API Error: ${res.statusText}`;
    let errorCode: ApiErrorCode = fallbackErrorCode(res.status);
    let requestId = res.headers.get('X-Request-Id') || undefined;
    try {
      const errorData = await res.json() as {
        error?: string;
        code?: string;
        requestId?: string;
      };
      if (errorData && errorData.error) {
        errorMsg = errorData.error;
      }
      if (errorData?.code) errorCode = errorData.code;
      if (errorData?.requestId) requestId = errorData.requestId;
    } catch {
      // Not JSON or no error field, backup to statusText
    }
    throw new ApiError({
      message: errorMsg,
      status: res.status,
      code: errorCode,
      requestId,
      retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
    });
  }
  return res.json() as Promise<T>;
};

const request = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  try {
    return await handleResponse<T>(await fetch(input, init));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      message: 'Unable to reach the server. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
    });
  }
};

export const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get<T = any>(endpoint: string, params?: Record<string, string>, namespace: TokenNamespace = 'restaurant'): Promise<T> {
    const url = new URL(`${API_URL}${endpoint}`);
    if (params) Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    return request<T>(url.toString(), {
      headers: getHeaders(namespace),
      credentials: namespaceCredentials(namespace),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getWithToken<T = any>(endpoint: string, token: string): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  },

  // For short-lived bearer tokens that aren't a stored namespace session,
  // e.g. the 30-minute table-session token from a QR capability exchange.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async postWithToken<T = any>(
    endpoint: string,
    body: unknown,
    token: string,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async post<T = any>(endpoint: string, body: unknown, namespace: TokenNamespace = 'restaurant'): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(namespace),
      credentials: namespaceCredentials(namespace),
      body: JSON.stringify(body),
    });
  },

  // No session exists yet for login, MFA, activation, or public capability exchange.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async postPublic<T = any>(endpoint: string, body: unknown): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: endpoint.startsWith('/super-admin/') ? 'include' : undefined,
      body: JSON.stringify(body),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async put<T = any>(endpoint: string, body: unknown, namespace: TokenNamespace = 'restaurant'): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(namespace),
      credentials: namespaceCredentials(namespace),
      body: JSON.stringify(body),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async patch<T = any>(endpoint: string, body: unknown, namespace: TokenNamespace = 'restaurant'): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'PATCH',
      headers: getHeaders(namespace),
      credentials: namespaceCredentials(namespace),
      body: JSON.stringify(body),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async delete<T = any>(endpoint: string, namespace: TokenNamespace = 'restaurant'): Promise<T> {
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(namespace),
      credentials: namespaceCredentials(namespace),
    });
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async upload<T = any>(endpoint: string, body: FormData): Promise<T> {
    const token = localStorage.getItem('auth_token');
    return request<T>(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body,
    });
  },
};
