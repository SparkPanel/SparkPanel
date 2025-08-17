import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { listBackups, createBackup, restoreBackup, deleteBackup, listTasks, createTask, updateTask, deleteTask, updateRcon } from '../api/servers';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import toast from 'react-hot-toast';

export default function ServerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: server, refetch } = useQuery({ queryKey: ['server', id], queryFn: async () => (await api.get(`/servers/${id}`)).data });
  const start = useMutation({ mutationFn: async () => (await api.post(`/servers/${id}/start`, {})).data, onSuccess: () => { refetch(); toast.success('Сервер запускается'); } });
  const stop = useMutation({ mutationFn: async () => (await api.post(`/servers/${id}/stop`, {})).data, onSuccess: () => { refetch(); toast.success('Сервер останавливается'); } });
  const token = useAuthStore(s => s.accessToken);
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');

  const { data: backups } = useQuery({ queryKey: ['backups', id], queryFn: () => listBackups(id) });
  const { data: tasks } = useQuery({ queryKey: ['tasks', id], queryFn: () => listTasks(id) });

  const doCreateBackup = useMutation({ mutationFn: () => createBackup(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['backups', id] }); toast.success('Бэкап создан'); }, onError: (e: any) => toast.error(e.response?.data?.error || 'Ошибка бэкапа') });
  const doRestore = useMutation({ mutationFn: (backupId: string) => restoreBackup(id, backupId), onSuccess: () => toast.success('Восстановление запущено'), onError: (e: any) => toast.error(e.response?.data?.error || 'Ошибка восстановления') });
  const doDeleteBackup = useMutation({ mutationFn: (backupId: string) => deleteBackup(id, backupId), onSuccess: () => { qc.invalidateQueries({ queryKey: ['backups', id] }); toast.success('Бэкап удалён'); } });

  const [newCron, setNewCron] = useState('0 3 * * *');
  const [newType, setNewType] = useState<'BACKUP'|'RESTART'>('BACKUP');
  const [cronPreview, setCronPreview] = useState<string[]>([]);
  const doCreateTask = useMutation({ mutationFn: () => createTask(id, { type: newType, cron: newCron }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', id] }); setCronPreview([]); toast.success('Задача добавлена'); }, onError: (e: any) => toast.error(e.response?.data?.error || 'CRON невалиден') });
  const doToggleTask = useMutation({ mutationFn: (t: any) => updateTask(id, t.id, { enabled: !t.enabled }), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', id] }) });
  const doDeleteTask = useMutation({ mutationFn: (taskId: string) => deleteTask(id, taskId), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', id] }); toast.success('Задача удалена'); } });

  const [rconEnabled, setRconEnabled] = useState(false);
  const [rconPort, setRconPort] = useState(25575);
  const [rconPassword, setRconPassword] = useState('');
  const doUpdateRcon = useMutation({ mutationFn: () => updateRcon(id, { rconEnabled, rconPort, rconPassword }), onSuccess: () => { refetch(); toast.success('RCON обновлён'); }, onError: (e: any) => toast.error(e.response?.data?.error || 'Ошибка RCON') });

  const [diskLimitMb, setDiskLimitMb] = useState<number>(10240);
  const doUpdateDisk = useMutation({ mutationFn: async () => (await api.put(`/servers/${id}`, { diskLimitMb })).data, onSuccess: () => { refetch(); toast.success('Лимит диска обновлён'); } });

  useEffect(() => {
    const s = io('/', { auth: { token } });
    s.emit('watch_server', id);
    s.emit('follow_logs', id);
    s.on('server_stats', (payload) => { if (payload.serverId === id) setStats(payload.stats); });
    s.on('server_log', (payload) => { if (payload.serverId === id) setLogs(prev => [...prev.slice(-500), payload.line]); });
    s.on('rcon_response', (payload) => { if (payload.serverId === id) setLogs(prev => [...prev.slice(-500), `> ${payload.response}`]); });
    return () => { s.emit('unwatch_server', id); s.disconnect(); };
  }, [id, token]);

  useEffect(() => {
    if (server) {
      setRconEnabled(!!server.rconEnabled);
      setRconPort(server.rconPort || 25575);
      setRconPassword(server.rconPassword || '');
      setDiskLimitMb(server.diskLimitMb || 10240);
    }
  }, [server]);

  async function sendCommand() {
    try {
      const s = io('/', { auth: { token } });
      s.emit('rcon_command', { serverId: id, command: cmd });
      setCmd('');
      setTimeout(() => s.disconnect(), 500);
    } catch (e: any) {
      toast.error('Не удалось отправить команду');
    }
  }

  async function previewCron() {
    try {
      const { data } = await api.get(`/servers/${id}/tasks/validate`, { params: { cron: newCron } });
      setCronPreview(data.next || []);
    } catch (e: any) {
      setCronPreview([e.response?.data?.error || 'CRON невалиден']);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Link to="/servers" className="opacity-70">← Назад</Link>
        <h1 className="text-2xl font-bold">{server?.name}</h1>
        <Tag color={server?.status === 'RUNNING' ? 'green' : server?.status === 'STOPPED' ? 'gray' : 'yellow'}>{server?.status}</Tag>
      </div>
      <div className="flex gap-2 mb-4">
        <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>Старт</Button>
        <Button onClick={() => stop.mutate()} loading={stop.isPending}>Стоп</Button>
        <Link to={`/servers/${id}/files`} className="px-3 py-1 border rounded">Файлы</Link>
      </div>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Card><div>CPU: {stats ? stats.cpuPercent.toFixed(1) : 0}%</div></Card>
        <Card><div>RAM: {stats ? (stats.memoryUsage/1024/1024).toFixed(0) : 0} / {stats ? (stats.memoryLimit/1024/1024).toFixed(0) : 0} MB</div></Card>
        <Card><div>Net: {stats ? stats.netIO.rx_bytes : 0} / {stats ? stats.netIO.tx_bytes : 0}</div></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Консоль / RCON">
          <div className="h-64 overflow-auto font-mono text-sm bg-black/80 text-green-400 p-2 rounded">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="border p-2 rounded flex-1" placeholder="Команда RCON" value={cmd} onChange={e => setCmd(e.target.value)} />
            <Button onClick={sendCommand}>Отправить</Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 items-end">
            <label className="flex items-center gap-2"><input type="checkbox" checked={rconEnabled} onChange={e => setRconEnabled(e.target.checked)} /> Включить RCON</label>
            <input className="border p-2 rounded" type="number" value={rconPort} onChange={e => setRconPort(Number(e.target.value))} />
            <input className="border p-2 rounded" placeholder="Пароль RCON" value={rconPassword} onChange={e => setRconPassword(e.target.value)} />
            <Button className="col-span-3" onClick={() => doUpdateRcon.mutate()}>Сохранить RCON</Button>
          </div>
        </Card>

        <Card title="Бэкапы">
          <Button onClick={() => doCreateBackup.mutate()}>Создать бэкап</Button>
          <div className="space-y-1 max-h-60 overflow-auto mt-2">
            {backups?.map((b: any) => (
              <div key={b.id} className="flex justify-between items-center border rounded p-2">
                <div className="text-sm">{new Date(b.createdAt).toLocaleString()} — {(b.sizeBytes/1024/1024).toFixed(1)} MB [{b.storage}]</div>
                <div className="flex gap-2">
                  <Button onClick={() => doRestore.mutate(b.id)}>Восстановить</Button>
                  <Button variant="danger" onClick={() => doDeleteBackup.mutate(b.id)}>Удалить</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Лимит диска">
          <div className="flex gap-2 items-end">
            <input className="border p-2 rounded w-40" type="number" value={diskLimitMb} onChange={e => setDiskLimitMb(Number(e.target.value))} />
            <span className="opacity-70">MB</span>
            <Button onClick={() => doUpdateDisk.mutate()}>Сохранить</Button>
          </div>
        </Card>

        <Card title="Задачи (CRON)">
          <div className="flex gap-2 mb-2">
            <select className="border p-2 rounded" value={newType} onChange={e => setNewType(e.target.value as any)}>
              <option value="BACKUP">Бэкап</option>
              <option value="RESTART">Рестарт</option>
            </select>
            <input className="border p-2 rounded flex-1" placeholder="CRON (например, 0 3 * * *)" value={newCron} onChange={e => setNewCron(e.target.value)} />
            <Button onClick={previewCron}>Проверить</Button>
            <Button onClick={() => doCreateTask.mutate()}>Добавить</Button>
          </div>
          {cronPreview.length > 0 && (
            <div className="text-sm opacity-80 mb-2">Предпросмотр: {cronPreview.join(' | ')}</div>
          )}
          <div className="space-y-1 max-h-60 overflow-auto">
            {tasks?.map((t: any) => (
              <div key={t.id} className="flex justify-between items-center border rounded p-2">
                <div className="text-sm">{t.type} — {t.cron} {t.enabled ? '(вкл)' : '(выкл)'} {t.lastRunAt ? `последний запуск: ${new Date(t.lastRunAt).toLocaleString()}` : ''}</div>
                <div className="flex gap-2">
                  <Button onClick={() => doToggleTask.mutate(t)}>{t.enabled ? 'Отключить' : 'Включить'}</Button>
                  <Button variant="danger" onClick={() => doDeleteTask.mutate(t.id)}>Удалить</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
