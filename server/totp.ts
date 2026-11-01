import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

/**
 * Одноразовые пароли по времени (TOTP, RFC 6238) — тот же алгоритм, что у Google Authenticator,
 * Microsoft Authenticator, Aegis и других приложений: HMAC-SHA1, 6 цифр, шаг 30 секунд.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Ссылка otpauth:// — её содержимое кодируется в QR-код для приложения-аутентификатора. */
export function totpUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return binary.toString().padStart(DIGITS, "0");
}

const lastUsedStep = new Map<string, number>();

/**
 * Проверяет код с допуском ±1 шаг (расхождение часов телефона до 30 секунд).
 * Повторно использовать уже принятый код нельзя — защита от перехвата.
 */
export function verifyTotp(secret: string, code: string, replayKey?: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const current = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(codeAt(secret, step));
    if (expected.length === code.length && timingSafeEqual(expected, Buffer.from(code))) {
      if (replayKey) {
        const key = `${replayKey}:${createHash("sha256").update(secret).digest("hex")}`;
        if ((lastUsedStep.get(key) ?? -1) >= step) return false;
        lastUsedStep.set(key, step);
      }
      return true;
    }
  }
  return false;
}

/* Коды восстановления: одноразовые, хранятся только в виде хешей. */

const hashRecoveryCode = (code: string) => createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");

export function generateRecoveryCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/** Возвращает оставшиеся хеши, если код подошёл (использованный код удаляется), иначе null. */
export function consumeRecoveryCode(hashes: string[], code: string): string[] | null {
  const hash = hashRecoveryCode(code);
  if (!hashes.includes(hash)) return null;
  return hashes.filter((h) => h !== hash);
}
