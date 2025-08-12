import { useState } from 'react';
import { register as apiRegister } from '../api/auth';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import toast from 'react-hot-toast';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRegister({ email, username, password });
      toast.success('Проверьте почту для подтверждения');
      setTimeout(() => navigate('/login'), 1000);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Ошибка регистрации');
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card title="Регистрация">
        <form className="space-y-3" onSubmit={onSubmit}>
          <input className="w-full p-2 border rounded" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full p-2 border rounded" placeholder="Имя пользователя" value={username} onChange={e => setUsername(e.target.value)} />
          <input type="password" className="w-full p-2 border rounded" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} />
          <Button variant="primary" type="submit">Создать</Button>
        </form>
      </Card>
    </div>
  );
}
