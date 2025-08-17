import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function AdminUsers() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-users'], queryFn: async () => (await api.get('/users')).data });
  const save = useMutation({
    mutationFn: async ({ id, roles }: { id: string; roles: string[] }) => (await api.put(`/users/${id}/roles`, { roles })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Пользователи</h1>
      <div className="space-y-2">
        {data?.map((u: any) => (
          <div key={u.id} className="p-3 border rounded flex items-center gap-3">
            <div className="w-64">{u.username} <span className="opacity-70">({u.email})</span></div>
            <label className="flex items-center gap-1"><input type="checkbox" checked={u.roles.includes('ADMIN')} onChange={e => save.mutate({ id: u.id, roles: e.target.checked ? ['ADMIN'] : ['USER'] })} /> ADMIN</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={u.roles.includes('MODERATOR')} onChange={e => save.mutate({ id: u.id, roles: e.target.checked ? [...new Set([...u.roles, 'MODERATOR'])] : u.roles.filter((r: string) => r !== 'MODERATOR') })} /> MODERATOR</label>
            <span className="opacity-70 text-sm">Подтвержден: {u.isEmailVerified ? 'да' : 'нет'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
