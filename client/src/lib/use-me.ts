import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserPermission } from "@shared/schema";

interface Me {
  user: { id: string; username: string; permissions: UserPermission[]; isFullAccess?: boolean; canCreateServers?: boolean };
}

/** Права, которые выдаются на отдельный сервер (владельцу и участникам). */
export const SERVER_SCOPED: UserPermission[] = ["servers.view", "servers.control", "servers.console", "servers.command", "servers.files", "servers.config", "servers.backups", "servers.ports"];

/**
 * Внутри страницы сервера — права текущего пользователя именно на этот сервер (их считает сервер панели).
 * Для них они заменяют общие права: участник видит только то, что ему выдали на этот сервер.
 */
export const ServerPermissionsContext = createContext<UserPermission[] | null>(null);

/** Права текущего пользователя — чтобы показывать только доступные ему кнопки. */
export function useCan() {
  const { data } = useQuery<Me>({ queryKey: ["/api/auth/me"], staleTime: 60_000 });
  const scoped = useContext(ServerPermissionsContext);
  const permissions = data?.user.permissions ?? [];
  return (...any: UserPermission[]) => any.some((p) => (scoped && SERVER_SCOPED.includes(p) ? scoped.includes(p) : permissions.includes(p)));
}

/** Может ли пользователь создавать серверы (менеджер серверов или квота). */
export function useCanCreateServers() {
  const { data } = useQuery<Me>({ queryKey: ["/api/auth/me"], staleTime: 60_000 });
  return Boolean(data?.user.canCreateServers);
}
