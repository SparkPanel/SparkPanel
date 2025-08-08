import { useState } from 'react';
import { register as apiRegister } from '../api/auth';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    try {
      await apiRegister({ email, username, password });
      setOk('Проверьте почту для подтверждения email.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Ошибка');
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-4">Регистрация</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full p-2 border rounded" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full p-2 border rounded" placeholder="Имя пользователя" value={username} onChange={e => setUsername(e.target.value)} />
        <input type="password" className="w-full p-2 border rounded" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
        {err && <div className="text-red-500 text-sm">{err}</div>}
        {ok && <div className="text-green-600 text-sm">{ok}</div>}
        <button className="bg-primary-600 text-white px-4 py-2 rounded">Создать</button>
      </form>
    </div>
  );
}
