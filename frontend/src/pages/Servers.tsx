import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import toast from 'react-hot-toast';

export default function Servers() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['servers'], queryFn: async () => (await api.get('/servers')).data });
  const [name, setName] = useState('');
  const [port, setPort] = useState(25565);
  const create = useMutation({
    mutationFn: async () => (await api.post('/servers', { name, port })).data,
    onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: ['servers'] }); toast.success('Сервер создан'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Ошибка создания')
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Сервера</h1>

      <Card className="mb-4" title="Создать сервер" actions={null}>
        <div className="flex gap-2">
          <input className="border p-2 rounded flex-1" placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
          <input className="border p-2 rounded w-32" type="number" value={port} onChange={e => setPort(Number(e.target.value))} />
          <Button variant="primary" onClick={() => create.mutate()} disabled={!name} loading={create.isPending}>Создать</Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="opacity-70">Загрузка...</div>
      ) : (
        <div className="grid gap-2">
          {data?.map((s: any) => (
            <Card key={s.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link className="font-semibold" to={`/servers/${s.id}`}>{s.name}</Link>
                  <Tag color={s.status === 'RUNNING' ? 'green' : s.status === 'STOPPED' ? 'gray' : 'yellow'}>{s.status}</Tag>
                </div>
                <div className="opacity-70 text-sm">Порт: {s.port}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
