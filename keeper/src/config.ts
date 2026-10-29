import dotenv from 'dotenv';
dotenv.config();

export interface KeeperConfig {
  rpcUrl: string;
  savingCoreAddress: string;
  keeperPrivateKey: string;
  pollIntervalMs: number;
  maxGasPriceGwei: number;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export function loadConfig(): KeeperConfig {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const savingCoreAddress = process.env.SAVING_CORE_ADDRESS || '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';
  
  // Default to Hardhat Account #3 private key if not set
  const keeperPrivateKey =
    process.env.KEEPER_PRIVATE_KEY ||
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
  const maxGasPriceGwei = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '100');

  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || undefined;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || undefined;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || undefined;

  return {
    rpcUrl,
    savingCoreAddress,
    keeperPrivateKey,
    pollIntervalMs,
    maxGasPriceGwei,
    discordWebhookUrl,
    telegramBotToken,
    telegramChatId,
  };
}

