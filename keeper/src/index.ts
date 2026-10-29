import { loadConfig } from './config.js';
import { AutoRenewKeeper } from './keeper.js';

async function main() {
  const config = loadConfig();
  const keeper = new AutoRenewKeeper(config);

  // Handle graceful shutdown
  const handleExit = () => {
    keeper.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  await keeper.start();
}

main().catch((err) => {
  console.error('Fatal Keeper Error:', err);
  process.exit(1);
});

