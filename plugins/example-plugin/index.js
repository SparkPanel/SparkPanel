/**
 * Пример плагина для SparkPanel.
 * Плагин — ES-модуль, экспортирующий initialize(context) и (необязательно) shutdown().
 */

/**
 * @param {{ pluginId: string, registerHook: (name: string, cb: Function) => void, log: (...args: unknown[]) => void }} context
 */
export async function initialize(context) {
  context.log("Plugin initialized");

  context.registerHook("server_start", async (serverId, serverInfo) => {
    context.log(`Server ${serverInfo?.name ?? serverId} started`);
  });

  context.registerHook("server_stop", async (serverId, serverInfo) => {
    context.log(`Server ${serverInfo?.name ?? serverId} stopped`);
  });

  context.registerHook("server_restart", async (serverId, serverInfo) => {
    context.log(`Server ${serverInfo?.name ?? serverId} restarted`);
  });
}

export async function shutdown() {
}

export default { initialize, shutdown };
