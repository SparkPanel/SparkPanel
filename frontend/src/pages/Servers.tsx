import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function Servers() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['servers'], queryFn: async () => (await api.get('/servers')).data });
  const [name, setName] = useState('');
  const [port, setPort] = useState(25565);
  const create = useMutation({
    mutationFn: async () => (await api.post('/servers', { name, port })).data,
    onSuccess: () => { setName(''); qc.invalidateQueries({ queryKey: ['servers'] }); }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Сервера</h1>
      <div className="p-4 border rounded mb-4">
        <div className="flex gap-2">
          <input className="border p-2 rounded flex-1" placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
          <input className="border p-2 rounded w-32" type="number" value={port} onChange={e => setPort(Number(e.target.value))} />
          <button className="bg-primary-600 text-white px-4 rounded" onClick={() => create.mutate()} disabled={!name}>Создать</button>
        </div>
      </div>
      <div className="grid gap-2">
        {data?.map((s: any) => (
          <Link key={s.id} className="p-3 border rounded flex justify-between" to={`/servers/${s.id}`}>
            <span>{s.name}</span>
            <span className="opacity-70">{s.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
