import { Rcon } from 'rcon-client';

export async function sendRconCommand(host: string, port: number, password: string, command: string) {
  const rcon = await Rcon.connect({ host, port, password, timeout: 5000 });
  try {
    const res = await rcon.send(command);
    return res;
  } finally {
    await rcon.end();
  }
}
