import { api } from './client';

export async function login(login: string, password: string, twoFactorToken?: string) {
  const { data } = await api.post('/auth/login', { login, password, twoFactorToken });
  return data;
}

export async function register(payload: { email: string; username: string; password: string }) {
  const { data } = await api.post('/auth/register', payload);
  return data;
}

export async function refresh() {
  const { data } = await api.post('/auth/refresh', {});
  return data;
}

export async function logout() {
  const { data } = await api.post('/auth/logout', {});
  return data;
}
