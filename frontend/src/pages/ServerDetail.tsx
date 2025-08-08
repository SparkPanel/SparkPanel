import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';

export default function ServerDetail() {
  const { id = '' } = useParams();
  const { data: server, refetch } = useQuery({ queryKey: ['server', id], queryFn: async () => (await api.get(`/servers/${id}`)).data });
  const start = useMutation({ mutationFn: async () => (await api.post(`/servers/${id}/start`, {})).data, onSuccess: () => refetch() });
  const stop = useMutation({ mutationFn: async () => (await api.post(`/servers/${id}/stop`, {})).data, onSuccess: () => refetch() });
  const token = useAuthStore(s => s.accessToken);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const s = io('/', { auth: { token } });
    s.emit('watch_server', id);
    s.on('server_stats', (payload) => { if (payload.serverId === id) setStats(payload.stats); });
    return () => { s.emit('unwatch_server', id); s.disconnect(); };
  }, [id, token]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link to="/servers" className="opacity-70">← Назад</Link>
        <h1 className="text-2xl font-bold">{server?.name}</h1>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={() => start.mutate()} disabled={start.isPending}>Старт</button>
        <button className="bg-yellow-600 text-white px-3 py-1 rounded" onClick={() => stop.mutate()} disabled={stop.isPending}>Стоп</button>
        <Link to={`/servers/${id}/files`} className="px-3 py-1 border rounded">Файлы</Link>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="p-3 border rounded">CPU: {stats ? stats.cpuPercent.toFixed(1) : 0}%</div>
        <div className="p-3 border rounded">RAM: {stats ? (stats.memoryUsage/1024/1024).toFixed(0) : 0} / {stats ? (stats.memoryLimit/1024/1024).toFixed(0) : 0} MB</div>
        <div className="p-3 border rounded">Net: {stats ? stats.netIO.rx_bytes : 0} / {stats ? stats.netIO.tx_bytes : 0}</div>
      </div>
    </div>
  );
}
