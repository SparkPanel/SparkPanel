import { create } from 'zustand';
import { login as apiLogin, refresh as apiRefresh, logout as apiLogout } from '../api/auth';

interface User { id: string; email: string; username: string; roles: string[] }

interface AuthState {
  accessToken: string | null;
  user: User | null;
  login: (login: string, password: string, twoFactorToken?: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  initFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  async login(loginId, password, twoFactorToken) {
    const data = await apiLogin(loginId, password, twoFactorToken);
    set({ accessToken: data.accessToken, user: data.user });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
  },
  async refresh() {
    const data = await apiRefresh();
    set({ accessToken: data.accessToken });
    localStorage.setItem('accessToken', data.accessToken);
  },
  async logout() {
    await apiLogout();
    set({ accessToken: null, user: null });
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  },
  initFromStorage() {
    const t = localStorage.getItem('accessToken');
    const u = localStorage.getItem('user');
    set({ accessToken: t, user: u ? JSON.parse(u) : null });
  }
}));
