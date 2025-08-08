import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useState, useEffect } from 'react';

export default function NavBar() {
  const { user, logout } = useAuthStore();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const navigate = useNavigate();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const t = localStorage.getItem('theme');
    if (t) setDark(t === 'dark');
  }, []);
  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto p-3 flex items-center gap-4">
        <Link to="/" className="font-bold">SparkPanel</Link>
        <Link to="/servers">Сервера</Link>
        <Link to="/settings">Настройки</Link>
        <div className="flex-1" />
        {user?.roles.includes('ADMIN') && <Link to="/admin/users">Админ</Link>}
        <button className="px-2" onClick={() => setDark(v => !v)}>{dark ? '🌙' : '☀️'}</button>
        {user ? (
          <>
            <span className="opacity-70">{user.username}</span>
            <button className="btn" onClick={async () => { await logout(); navigate('/login'); }}>Выйти</button>
          </>
        ) : (
          <>
            <Link to="/login">Войти</Link>
            <Link to="/register">Регистрация</Link>
          </>
        )}
      </div>
    </div>
  );
}
