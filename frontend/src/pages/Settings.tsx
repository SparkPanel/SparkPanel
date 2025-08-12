import { useState } from 'react';
import { api } from '../api/client';

export default function Settings() {
  const [qr, setQr] = useState<string | null>(null);
  const [base32, setBase32] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  async function setup() {
    const { data } = await api.post('/auth/2fa/setup', {});
    setQr(data.qrDataUrl);
    setBase32(data.base32);
  }
  async function enable() {
    await api.post('/auth/2fa/enable', { token });
    setMsg('2FA включена');
  }
  async function disable() {
    await api.post('/auth/2fa/disable', { token });
    setMsg('2FA выключена');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Настройки</h1>
      <div className="p-4 border rounded space-y-2">
        <button className="bg-primary-600 text-white px-4 py-2 rounded" onClick={setup}>Сгенерировать 2FA</button>
        {qr && <img src={qr} alt="qr" className="w-40 h-40" />}
        {base32 && <div className="text-sm">Секрет: {base32}</div>}
        <div className="flex gap-2">
          <input className="border p-2 rounded" placeholder="Код 2FA" value={token} onChange={e => setToken(e.target.value)} />
          <button className="px-3 py-1 border rounded" onClick={enable}>Включить</button>
          <button className="px-3 py-1 border rounded" onClick={disable}>Выключить</button>
        </div>
        {msg && <div className="text-green-600 text-sm">{msg}</div>}
      </div>
    </div>
  );
}
