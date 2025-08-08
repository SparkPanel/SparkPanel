import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useState } from 'react';

export default function Files() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [path, setPath] = useState('.')
  const { data } = useQuery({ queryKey: ['files', id, path], queryFn: async () => (await api.get(`/servers/${id}/files`, { params: { path } })).data });

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    await api.post(`/servers/${id}/files/upload`, form, { params: { path: file.name } });
    qc.invalidateQueries({ queryKey: ['files', id, path] });
  }
  async function remove(name: string) {
    await api.delete(`/servers/${id}/files`, { params: { path: path + '/' + name } });
    qc.invalidateQueries({ queryKey: ['files', id, path] });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input className="border p-2 rounded flex-1" value={path} onChange={e => setPath(e.target.value)} />
        <input type="file" onChange={upload} />
      </div>
      <div className="border rounded">
        {data?.map((e: any) => (
          <div key={e.name} className="flex justify-between p-2 border-b last:border-0">
            <span>{e.isDir ? '📁' : '📄'} {e.name}</span>
            <div className="flex gap-2">
              {!e.isDir && <a className="underline" href={`/api/servers/${id}/files/download?path=${encodeURIComponent(path + '/' + e.name)}`}>Скачать</a>}
              <button className="text-red-600" onClick={() => remove(e.name)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
