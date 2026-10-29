import { KeeperConfig } from './config.js';

export async function sendNotification(
  config: KeeperConfig,
  title: string,
  message: string,
  fields?: Record<string, string>
) {
  // 1. Discord Webhook
  if (config.discordWebhookUrl) {
    try {
      const discordEmbed = {
        title,
        description: message,
        color: 0x10b981, // Emerald green
        timestamp: new Date().toISOString(),
        fields: fields
          ? Object.entries(fields).map(([name, value]) => ({
              name,
              value,
              inline: true,
            }))
          : [],
      };

      await fetch(config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [discordEmbed] }),
      });
    } catch (err) {
      console.warn('[Notifier] Discord webhook error:', err);
    }
  }

  // 2. Telegram Bot
  if (config.telegramBotToken && config.telegramChatId) {
    try {
      let text = `🤖 *${title}*\n${message}\n`;
      if (fields) {
        for (const [k, v] of Object.entries(fields)) {
          text += `\n• *${k}:* \`${v}\``;
        }
      }

      const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.warn('[Notifier] Telegram bot error:', err);
    }
  }
}

