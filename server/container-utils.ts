import type Docker from "dockerode";
import type { Container } from "dockerode";
import { PassThrough, Readable, Writable } from "stream";
import tar from "tar-stream";

/**
 * Парсер мультиплексированного потока Docker (attach/exec/logs без TTY).
 * Каждый кадр: [тип(1), 0, 0, 0, размер(4, BE)] + payload. Тип 1 — stdout, 2 — stderr.
 */
export class DockerStreamDemuxer {
  private buffer = Buffer.alloc(0);

  constructor(private onFrame: (stream: "stdout" | "stderr", payload: Buffer) => void) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.buffer.length >= 8) {
      const type = this.buffer[0];
      if ((type !== 0 && type !== 1 && type !== 2) || this.buffer[1] !== 0 || this.buffer[2] !== 0 || this.buffer[3] !== 0) {
        this.onFrame("stdout", this.buffer);
        this.buffer = Buffer.alloc(0);
        return;
      }
      const size = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + size) return;
      const payload = this.buffer.subarray(8, 8 + size);
      this.onFrame(type === 2 ? "stderr" : "stdout", payload);
      this.buffer = this.buffer.subarray(8 + size);
    }
  }
}

/** Разбирает целиком полученный мультиплексированный буфер (например, результат container.logs без follow). */
export function demuxBuffer(data: Buffer): { stdout: Buffer; stderr: Buffer } {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const demuxer = new DockerStreamDemuxer((stream, payload) => (stream === "stderr" ? err : out).push(Buffer.from(payload)));
  demuxer.push(data);
  return { stdout: Buffer.concat(out), stderr: Buffer.concat(err) };
}

export interface ExecOptions {
  /** Данные для stdin процесса (строка, буфер или поток). */
  stdin?: string | Buffer | Readable;
  /** Куда писать stdout (для потоковой передачи больших данных). Если не задан — накапливается в результате. */
  stdout?: Writable;
  user?: string;
  workingDir?: string;
  env?: string[];
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
}

/**
 * Выполняет команду в контейнере без оболочки (argv), корректно демультиплексирует вывод,
 * дожидается завершения и возвращает код выхода.
 */
export async function execInContainer(container: Container, cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const hasStdin = options.stdin !== undefined;
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: hasStdin,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    User: options.user,
    WorkingDir: options.workingDir,
    Env: options.env,
  });

  const stream = (await exec.start({ hijack: true, stdin: hasStdin })) as unknown as NodeJS.ReadWriteStream & {
    destroy?: () => void;
    end: (data?: any) => void;
  };

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutError: Error | null = null;

  const demuxer = new DockerStreamDemuxer((type, payload) => {
    if (type === "stderr") {
      stderrChunks.push(Buffer.from(payload));
    } else if (options.stdout) {
      if (!options.stdout.write(Buffer.from(payload))) {
        stream.pause();
        options.stdout.once("drain", () => stream.resume());
      }
    } else {
      stdoutChunks.push(Buffer.from(payload));
    }
  });

  options.stdout?.on("error", (err) => {
    stdoutError = err;
    stream.destroy?.();
  });

  const finished = new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    const done = (err?: Error) => {
      if (timer) clearTimeout(timer);
      err ? reject(err) : resolve();
    };
    stream.on("data", (chunk: Buffer) => demuxer.push(chunk));
    stream.on("end", () => done());
    stream.on("close", () => done());
    stream.on("error", (err: Error) => done(err));
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        stream.destroy?.();
        done(new Error(`Command timed out after ${Math.round(options.timeoutMs! / 1000)}s`));
      }, options.timeoutMs);
    }
  });

  if (hasStdin) {
    const input = options.stdin!;
    if (input instanceof Readable) {
      input.on("error", () => stream.end());
      input.pipe(stream as unknown as Writable);
    } else {
      stream.end(input);
    }
  }

  await finished;
  if (stdoutError) throw stdoutError;

  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  for (;;) {
    const info = await exec.inspect();
    if (!info.Running) {
      return { stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode: info.ExitCode ?? 0 };
    }
    if (Date.now() > deadline) throw new Error(`Command did not finish in ${Math.round((options.timeoutMs ?? 120_000) / 1000)}s`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** То же, что execInContainer, но бросает исключение при ненулевом коде выхода. */
export async function execChecked(container: Container, cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const result = await execInContainer(container, cmd, options);
  if (result.exitCode !== 0) {
    const message = result.stderr.toString("utf-8").trim() || result.stdout.toString("utf-8").trim() || `exit code ${result.exitCode}`;
    throw new Error(message.split("\n").slice(-3).join(" "));
  }
  return result;
}

/** Скачивает образ (если его нет локально или force=true). */
export async function ensureImage(docker: Docker, image: string, force = false): Promise<void> {
  if (!force) {
    try {
      await docker.getImage(image).inspect();
      return;
    } catch {
    }
  }
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(new Error(`Failed to pull image ${image}: ${err.message}`));
      docker.modem.followProgress(stream, (progressErr: Error | null) => {
        if (progressErr) return reject(new Error(`Failed to pull image ${image}: ${progressErr.message}`));
        resolve();
      });
    });
  });
}

/** Собирает образ из набора файлов (Dockerfile и контекст), передаваемых в памяти. */
export async function buildImageFromFiles(docker: Docker, tag: string, files: Record<string, string>): Promise<void> {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(files)) {
    pack.entry({ name, mode: 0o644 }, content);
  }
  pack.finalize();

  const stream = await docker.buildImage(pack as unknown as NodeJS.ReadableStream, { t: tag, rm: true, forcerm: true });
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null, output: any[]) => {
        if (err) return reject(err);
        const failed = output?.find((entry) => entry?.error || entry?.errorDetail);
        if (failed) return reject(new Error(failed.error || failed.errorDetail?.message || "Image build failed"));
        resolve();
      },
    );
  });
}

export async function ensureVolume(docker: Docker, name: string, labels: Record<string, string> = {}): Promise<void> {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name, Labels: labels });
  }
}

export async function removeContainerQuietly(docker: Docker, nameOrId: string): Promise<void> {
  try {
    await docker.getContainer(nameOrId).remove({ force: true, v: false });
  } catch (error: any) {
    if (error?.statusCode !== 404) {
      console.warn(`Failed to remove container ${nameOrId}:`, error?.message || error);
    }
  }
}

export async function containerExists(docker: Docker, nameOrId: string): Promise<boolean> {
  try {
    await docker.getContainer(nameOrId).inspect();
    return true;
  } catch {
    return false;
  }
}

/** Поток, который просто передаёт данные дальше; удобен для связки exec stdout → exec stdin. */
export function passThrough(): PassThrough {
  return new PassThrough({ highWaterMark: 1024 * 1024 });
}
