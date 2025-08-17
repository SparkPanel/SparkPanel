import fetch from 'node-fetch';

export async function sendDiscordWebhook(webhookUrl: string, content: string) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
} 