import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import toast from 'react-hot-toast';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [twofa, setTwofa] = useState('');
  const navigate = useNavigate();
  const doLogin = useAuthStore(s => s.login);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await doLogin(login, password, twofa || undefined);
      toast.success('Добро пожаловать!');
      navigate('/');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Ошибка входа');
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card title="Вход">
        <form className="space-y-3" onSubmit={onSubmit}>
          <input className="w-full p-2 border rounded" placeholder="Email или имя" value={login} onChange={e => setLogin(e.target.value)} />
          <input type="password" className="w-full p-2 border rounded" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
          <input className="w-full p-2 border rounded" placeholder="Код 2FA (если включен)" value={twofa} onChange={e => setTwofa(e.target.value)} />
          <Button variant="primary" type="submit">Войти</Button>
        </form>
      </Card>
    </div>
  );
}
