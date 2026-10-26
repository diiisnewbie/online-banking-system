import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactsDir = path.resolve(__dirname, '../artifacts/contracts');
const targetDir = path.resolve(__dirname, '../../frontend/src/contracts/abis');

const contracts = [
  { artifact: 'MockUSDC.sol/MockUSDC.json', output: 'MockUSDC.json' },
  { artifact: 'VaultManager.sol/VaultManager.json', output: 'VaultManager.json' },
  { artifact: 'SavingCore.sol/SavingCore.json', output: 'SavingCore.json' }
];

console.log('[export-abi] Starting ABI extraction...');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[export-abi] Created target directory: ${targetDir}`);
}

for (const item of contracts) {
  const artifactPath = path.join(artifactsDir, item.artifact);
  if (!fs.existsSync(artifactPath)) {
    console.error(`[export-abi] ERROR: Artifact not found at ${artifactPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(artifactPath, 'utf8');
  const parsed = JSON.parse(rawData);

  if (!parsed.abi) {
    console.error(`[export-abi] ERROR: No ABI found in ${artifactPath}`);
    process.exit(1);
  }

  const outputPath = path.join(targetDir, item.output);
  fs.writeFileSync(outputPath, JSON.stringify(parsed.abi, null, 2), 'utf8');
  console.log(`[export-abi] Exported ${item.output} (${parsed.abi.length} entries)`);
}

console.log('[export-abi] All ABIs exported successfully!');
