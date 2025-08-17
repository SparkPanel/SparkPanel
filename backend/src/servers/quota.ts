import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';

export async function getDirectorySizeBytes(dir: string): Promise<number> {
  let total = 0;
  const stack: string[] = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else total += fssync.statSync(p).size;
    }
  }
  return total;
}
