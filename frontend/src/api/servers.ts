import { api } from './client';

export async function listBackups(serverId: string) {
  const { data } = await api.get(`/servers/${serverId}/backups`);
  return data;
}

export async function createBackup(serverId: string) {
  const { data } = await api.post(`/servers/${serverId}/backups`, {});
  return data;
}

export async function restoreBackup(serverId: string, backupId: string) {
  const { data } = await api.post(`/servers/${serverId}/backups/${backupId}/restore`, {});
  return data;
}

export async function deleteBackup(serverId: string, backupId: string) {
  const { data } = await api.delete(`/servers/${serverId}/backups/${backupId}`);
  return data;
}

export async function listTasks(serverId: string) {
  const { data } = await api.get(`/servers/${serverId}/tasks`);
  return data;
}

export async function createTask(serverId: string, payload: { type: 'BACKUP' | 'RESTART'; cron: string; enabled?: boolean }) {
  const { data } = await api.post(`/servers/${serverId}/tasks`, payload);
  return data;
}

export async function updateTask(serverId: string, taskId: string, payload: Partial<{ type: 'BACKUP' | 'RESTART'; cron: string; enabled: boolean }>) {
  const { data } = await api.put(`/servers/${serverId}/tasks/${taskId}`, payload);
  return data;
}

export async function deleteTask(serverId: string, taskId: string) {
  const { data } = await api.delete(`/servers/${serverId}/tasks/${taskId}`);
  return data;
}

export async function updateRcon(serverId: string, payload: { rconEnabled: boolean; rconPort?: number; rconPassword?: string }) {
  const { data } = await api.put(`/servers/${serverId}/rcon`, payload);
  return data;
}
