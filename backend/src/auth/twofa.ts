import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export function generateTwoFaSecret(username: string) {
  const secret = speakeasy.generateSecret({ length: 20, name: `SparkPanel (${username})` });
  return secret; // { ascii, hex, base32, otpauth_url }
}

export function verifyTwoFaToken(base32Secret: string, token: string) {
  return speakeasy.totp.verify({ secret: base32Secret, encoding: 'base32', token, window: 1 });
}

export async function generateQrDataUrl(otpauthUrl: string) {
  return QRCode.toDataURL(otpauthUrl);
} 