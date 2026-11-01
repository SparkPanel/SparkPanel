import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";
import type { Server } from "@shared/schema";
import { storage } from "./storage";
import { execInServerFiles } from "./game-server";
import { logStreamer } from "./log-streamer";
import { beginServerAction, isActionInProgress } from "./server-actions";
import { getScaling, syncReplicaFiles } from "./scaling";

/** Настройки деплоя из Git, хранятся в server.config.git. */
export interface GitSettings {
  url: string;
  branch: string;
  /** Токен доступа к приватному репозиторию (GitHub/GitLab personal access token). */
  token?: string;
  webhookSecret: string;
  restartAfterDeploy: boolean;
  lastDeploy?: { at: string; ok: boolean; commit?: string; message: string };
}

const URL_PATTERN = /^https?:\/\/[^\s'"`\\]+$/;
const BRANCH_PATTERN = /^[\w][\w./-]{0,199}$/;

export function getGitSettings(server: Server): GitSettings | null {
  const git = (server.config as Record<string, any> | null)?.git;
  return git && typeof git.url === "string" ? (git as GitSettings) : null;
}

/** Для ответа API: токен не возвращается, только признак его наличия. */
export function publicGitSettings(server: Server) {
  const git = getGitSettings(server);
  if (!git) return null;
  const { token, ...rest } = git;
  return { ...rest, hasToken: Boolean(token) };
}

export function validateGitInput(input: { url: string; branch: string }): void {
  if (!URL_PATTERN.test(input.url)) throw Object.assign(new Error("Use an https:// repository address, for example https://github.com/user/bot.git"), { status: 400 });
  if (!BRANCH_PATTERN.test(input.branch) || input.branch.includes("..")) throw Object.assign(new Error("Invalid branch name"), { status: 400 });
}

export const newWebhookSecret = () => randomBytes(24).toString("hex");

const DEPLOY_SCRIPT = `set -e
URL="$1"; BRANCH="$2"
AUTH_URL="$URL"
if [ -n "$GIT_TOKEN" ]; then
  case "$URL" in
    https://*) AUTH_URL="https://x-access-token:$GIT_TOKEN@\${URL#https://}" ;;
    http://*) AUTH_URL="http://x-access-token:$GIT_TOKEN@\${URL#http://}" ;;
  esac
fi
[ -d .git ] || { git init -q; git remote add origin "$URL"; }
git remote set-url origin "$URL"
git -c credential.helper= fetch -q --depth 1 "$AUTH_URL" "$BRANCH"
git reset -q --hard FETCH_HEAD
git log -1 --format='%h %s'`;

const deploying = new Set<string>();

/** Скачивает код из репозитория в папку сервера и при необходимости перезапускает его. */
export async function deployFromGit(server: Server, initiatedBy: string, userId?: string): Promise<{ commit: string }> {
  const git = getGitSettings(server);
  if (!git) throw Object.assign(new Error("Connect a repository first"), { status: 400 });
  if (deploying.has(server.id)) throw Object.assign(new Error("A deploy is already running"), { status: 409 });
  deploying.add(server.id);
  const hide = (text: string) => (git.token ? text.split(git.token).join("***") : text);
  try {
    await logStreamer.notifyStatus(server, `Deploying ${git.branch} from ${git.url}…`);
    const result = await execInServerFiles(server, ["sh", "-c", DEPLOY_SCRIPT, "deploy", git.url, git.branch], {
      timeoutMs: 180_000,
      env: ["GIT_TERMINAL_PROMPT=0", `GIT_TOKEN=${git.token ?? ""}`],
    });
    const output = hide(`${result.stdout.toString()}${result.stderr.toString()}`).trim();
    if (result.exitCode !== 0) {
      const message = output.split("\n").slice(-3).join(" ") || `git exited with code ${result.exitCode}`;
      await saveLastDeploy(server.id, { at: new Date().toISOString(), ok: false, message });
      await logStreamer.notifyStatus(server, `Deploy failed: ${message}`);
      throw Object.assign(new Error(message), { status: 502 });
    }
    const commit = output.split("\n").pop() ?? "";
    await saveLastDeploy(server.id, { at: new Date().toISOString(), ok: true, commit, message: `Deployed ${commit}` });
    await logStreamer.notifyStatus(server, `Deployed ${commit}`);
    await storage.addActivity({ type: "file_change", title: "Deployed From Git", description: `${server.name}: ${commit} (${initiatedBy})`, timestamp: new Date(), userId });

    const fresh = (await storage.getServer(server.id)) ?? server;
    /* У сайта с копиями новый код раскладывается и по копиям — по очереди, без остановки всего сайта. */
    if (getScaling(fresh).replicas.length) {
      syncReplicaFiles(fresh.id).catch((error) => console.warn(`Copies of ${fresh.name} were not updated:`, error.message));
    }
    if (git.restartAfterDeploy && fresh.status === "running" && !isActionInProgress(fresh.id)) {
      const { done } = await beginServerAction(fresh, "restart", userId);
      done.catch(() => {});
    }
    return { commit };
  } finally {
    deploying.delete(server.id);
  }
}

async function saveLastDeploy(serverId: string, lastDeploy: GitSettings["lastDeploy"]): Promise<void> {
  const server = await storage.getServer(serverId);
  const git = server && getGitSettings(server);
  if (!server || !git) return;
  await storage.updateServer(serverId, { config: { ...((server.config as Record<string, any>) || {}), git: { ...git, lastDeploy } } });
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Проверяет вебхук: GitHub (X-Hub-Signature-256), Gitea/Forgejo (X-Gitea-Signature), GitLab (X-Gitlab-Token)
 * или простой секрет в заголовке X-SparkPanel-Secret / параметре ?secret=.
 */
export function verifyWebhook(req: Request, secret: string): boolean {
  const raw = req.rawBody ?? Buffer.from("");
  const hmac = createHmac("sha256", secret).update(raw).digest("hex");
  const github = req.header("x-hub-signature-256");
  if (github) return safeEqual(github, `sha256=${hmac}`);
  const gitea = req.header("x-gitea-signature") ?? req.header("x-forgejo-signature");
  if (gitea) return safeEqual(gitea, hmac);
  const plain = req.header("x-gitlab-token") ?? req.header("x-sparkpanel-secret") ?? (typeof req.query.secret === "string" ? req.query.secret : undefined);
  return plain !== undefined && safeEqual(plain, secret);
}
