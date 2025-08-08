import axios from 'axios';
import { useAuthStore } from '../store/auth';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any)['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<void> | null = null;

api.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  if (error.response?.status === 401 && !original._retry) {
    original._retry = true;
    if (!refreshing) {
      refreshing = useAuthStore.getState().refresh();
      try { await refreshing; } finally { refreshing = null; }
    } else {
      await refreshing;
    }
    return api(original);
  }
  return Promise.reject(error);
});
