const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const fallbackProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const fallbackApiUrl = import.meta.env.PROD
  ? `${fallbackProtocol}//${hostname}/api`
  : `${fallbackProtocol}//${hostname}:3000/api`;
const API_URL = (import.meta.env.VITE_API_URL || fallbackApiUrl).replace(/\/$/, '');

const getHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    let errorMsg = `API Error: ${res.statusText}`;
    try {
      const errorData = await res.json();
      if (errorData && errorData.error) {
        errorMsg = errorData.error;
      }
    } catch {
      // Not JSON or no error field, backup to statusText
    }
    throw new Error(errorMsg);
  }
  return res.json();
};

export const api = {
  async get(endpoint: string, params?: Record<string, string>) {
    const url = new URL(`${API_URL}${endpoint}`);
    if (params) Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const res = await fetch(url.toString(), { headers: getHeaders() });
    return handleResponse(res);
  },

  async getWithToken(endpoint: string, token: string) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    return handleResponse(res);
  },

  async post(endpoint: string, body: unknown) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async put(endpoint: string, body: unknown) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async delete(endpoint: string) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return handleResponse(res);
  },

  async upload(endpoint: string, body: FormData) {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body,
    });
    return handleResponse(res);
  },
};
