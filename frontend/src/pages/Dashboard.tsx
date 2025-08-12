import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Dashboard() {
  const { data: servers } = useQuery({ queryKey: ['servers'], queryFn: async () => (await api.get('/servers')).data });
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Дашборд</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded border">Сервера: {servers?.length ?? 0}</div>
      </div>
    </div>
  );
}
