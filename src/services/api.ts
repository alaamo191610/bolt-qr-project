// detect if running on localhost or network IP
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const API_URL = `http://${hostname}:3000/api`;

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
    } catch (e) {
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

  async post(endpoint: string, body: any) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async put(endpoint: string, body: any) {
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
};