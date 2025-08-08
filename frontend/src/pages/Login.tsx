import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [twofa, setTwofa] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();
  const doLogin = useAuthStore(s => s.login);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await doLogin(login, password, twofa || undefined);
      navigate('/');
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Ошибка');
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-4">Вход</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full p-2 border rounded" placeholder="Email или имя" value={login} onChange={e => setLogin(e.target.value)} />
        <input type="password" className="w-full p-2 border rounded" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
        <input className="w-full p-2 border rounded" placeholder="Код 2FA (если включен)" value={twofa} onChange={e => setTwofa(e.target.value)} />
        {err && <div className="text-red-500 text-sm">{err}</div>}
        <button className="bg-primary-600 text-white px-4 py-2 rounded">Войти</button>
      </form>
    </div>
  );
}
