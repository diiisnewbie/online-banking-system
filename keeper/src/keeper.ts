import { ethers } from 'ethers';
import { KeeperConfig } from './config.js';
import { sendNotification } from './notifier.js';
import SavingCoreAbi from './abis/SavingCore.json' with { type: 'json' };
import VaultManagerAbi from './abis/VaultManager.json' with { type: 'json' };

// DepositStatus enum mapping exactly matching SavingCore.sol
enum DepositStatus {
  Active = 0,
  Withdrawn = 1,
  ManualRenewed = 2,
  AutoRenewed = 3,
}

export class AutoRenewKeeper {
  private config: KeeperConfig;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private savingCore: ethers.Contract;
  private isRunning: boolean = false;
  private inFlightRenewals: Set<string> = new Set();

  constructor(config: KeeperConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.keeperPrivateKey, this.provider);
    this.savingCore = new ethers.Contract(
      config.savingCoreAddress,
      SavingCoreAbi as ethers.InterfaceAbi,
      this.signer
    );
  }

  public async start() {
    this.isRunning = true;
    console.log('====================================================');
    console.log('🏦  ON-CHAIN TERM DEPOSIT KEEPER BOT 24/7 STARTED');
    console.log('====================================================');
    console.log(`📡 RPC Endpoint:          ${this.config.rpcUrl}`);
    console.log(`📄 SavingCore Address:    ${this.config.savingCoreAddress}`);
    console.log(`🤖 Keeper Bot Address:    ${this.signer.address}`);
    console.log(`⏱️  Polling Interval:      ${this.config.pollIntervalMs} ms`);
    console.log(`⛽ Max Gas Price:         ${this.config.maxGasPriceGwei} Gwei`);
    console.log('====================================================\n');

    // Initial bot balance check
    await this.logBotBalance();

    // Start polling loop
    this.pollLoop();
  }

  public stop() {
    this.isRunning = false;
    console.log('\n🛑 Keeper Bot stopped gracefully.');
  }

  private async logBotBalance() {
    try {
      const balance = await this.provider.getBalance(this.signer.address);
      const ethBal = ethers.formatEther(balance);
      console.log(`💰 Keeper ETH Balance: ${ethBal} ETH`);
      if (balance === 0n) {
        console.warn('⚠️  WARNING: Keeper bot balance is 0 ETH! It cannot broadcast transactions.');
      }
    } catch (err) {
      console.warn('⚠️  Failed to query keeper ETH balance:', err);
    }
  }

  private async pollLoop() {
    while (this.isRunning) {
      try {
        await this.scanAndExecute();
      } catch (err: any) {
        console.error(`[Keeper] ❌ Scan cycle error:`, err?.message || err);
      }
      await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
    }
  }

  private async scanAndExecute() {
    // 1. Get latest block information
    const latestBlock = await this.provider.getBlock('latest');
    if (!latestBlock) return;

    const currentBlockTimestamp = BigInt(latestBlock.timestamp);
    const blockDateStr = new Date(Number(currentBlockTimestamp) * 1000).toLocaleString('vi-VN');

    // 2. Query contract state
    const [nextDepositIdBn, gracePeriodBn] = await Promise.all([
      this.savingCore.nextDepositId(),
      this.savingCore.gracePeriod(),
    ]);

    const totalDeposits = Number(nextDepositIdBn);
    const gracePeriod = BigInt(gracePeriodBn);

    console.log(`[Keeper ${new Date().toLocaleTimeString('vi-VN')}] 🔍 Polling cycle - ${totalDeposits - 1} deposits recorded (Block #${latestBlock.number})`);

    // 3. Scan all existing certificates
    for (let id = 1; id < totalDeposits; id++) {
      const depositId = BigInt(id);
      const depositKey = depositId.toString();

      // Skip if currently in flight
      if (this.inFlightRenewals.has(depositKey)) {
        continue;
      }

      try {
        const cert = await this.savingCore.getCertificate(depositId);
        const status = Number(cert.status);

        // Only active certificates can be auto-renewed
        if (status !== DepositStatus.Active) {
          continue;
        }

        const maturityAt = BigInt(cert.maturityAt);
        const eligibleAt = maturityAt + gracePeriod;

        // Check if eligible for Auto-Renew (block.timestamp >= maturityAt + gracePeriod)
        if (currentBlockTimestamp >= eligibleAt) {
          const overdueSeconds = Number(currentBlockTimestamp - eligibleAt);
          const overdueHours = (overdueSeconds / 3600).toFixed(1);

          console.log(`\n🔔 [TRIGGER] Deposit #${depositId} is eligible for Auto-Renew!`);
          console.log(`   • Owner:         ${await this.savingCore.ownerOf(depositId)}`);
          console.log(`   • Principal:     ${ethers.formatUnits(cert.principal, 6)} USDC`);
          console.log(`   • Maturity At:   ${new Date(Number(maturityAt) * 1000).toLocaleString('vi-VN')}`);
          console.log(`   • Grace Period:  ${Number(gracePeriod) / 86400} days`);
          console.log(`   • EVM Clock:     ${blockDateStr}`);
          console.log(`   • Overdue by:    ${overdueHours} hours (Backdate applies)`);

          // Execute Auto-Renew with dry-run protection
          await this.executeAutoRenew(depositId, cert, currentBlockTimestamp);
        }
      } catch (err: any) {
        // Individual cert query error
        console.warn(`[Keeper] Could not inspect cert #${depositId}:`, err?.message || err);
      }
    }
  }

  private async executeAutoRenew(depositId: bigint, oldCert: any, currentBlockTimestamp: bigint) {
    const depositKey = depositId.toString();
    this.inFlightRenewals.add(depositKey);

    try {
      // 1. Gas price safeguard
      const feeData = await this.provider.getFeeData();
      if (feeData.gasPrice) {
        const gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice, 'gwei'));
        if (gasPriceGwei > this.config.maxGasPriceGwei) {
          console.warn(
            `⚠️  [Gas Alert] Current gas price (${gasPriceGwei.toFixed(2)} Gwei) exceeds limit (${this.config.maxGasPriceGwei} Gwei). Skipping for now.`
          );
          return;
        }
      }

      // 2. Pre-flight Simulation (Dry-run with staticCall)
      console.log(`   🧪 Simulating autoRenewDeposit(${depositId}) via eth_call...`);
      try {
        await this.savingCore.autoRenewDeposit.staticCall(depositId);
        console.log(`   ✅ Simulation SUCCESS! Vault has enough liquidity.`);
      } catch (simError: any) {
        console.error(
          `   ❌ Simulation REVERTED! Reason: ${simError?.reason || simError?.message || 'Unknown'}`
        );
        console.warn(`   ⏩ Skipping transaction to avoid losing gas fees.`);
        return;
      }

      // 3. Broadcast real transaction
      console.log(`   📡 Broadcasting transaction from ${this.signer.address}...`);
      const tx = await this.savingCore.autoRenewDeposit(depositId);
      console.log(`   ⏳ Transaction submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`   🎉 [CONFIRMED] In Block #${receipt.blockNumber} (Gas Used: ${receipt.gasUsed.toString()})`);

      // 4. Extract new deposit details from Renewed event
      let newDepositIdStr = 'Unknown';
      let newPrincipalStr = 'Unknown';

      for (const log of receipt.logs) {
        try {
          const parsed = this.savingCore.interface.parseLog(log);
          if (parsed && parsed.name === 'Renewed') {
            newDepositIdStr = parsed.args.newDepositId.toString();
            newPrincipalStr = ethers.formatUnits(parsed.args.newPrincipal, 6);
            break;
          }
        } catch {
          // Ignore logs from other contracts
        }
      }

      console.log(`   ✨ New NFT Created:     #${newDepositIdStr}`);
      console.log(`   💰 Compounded Principal: ${newPrincipalStr} USDC`);
      console.log(`   ⏱️  Backdated Start:     ${new Date(Number(oldCert.maturityAt) * 1000).toLocaleString('vi-VN')}`);
      console.log(`====================================================\n`);

      // 5. Send Webhook Notification (Discord / Telegram)
      await sendNotification(
        this.config,
        `Auto-Renew Completed for Deposit #${depositId}`,
        `Successfully auto-renewed certificate and minted new NFT #${newDepositIdStr}.`,
        {
          'Old Deposit': `#${depositId}`,
          'New Deposit': `#${newDepositIdStr}`,
          'New Principal': `${newPrincipalStr} USDC`,
          'Transaction Hash': tx.hash,
          'Block Number': receipt.blockNumber.toString(),
        }
      );
    } catch (err: any) {
      console.error(`   ❌ [Failed] Auto-renew error for #${depositId}:`, err?.message || err);
    } finally {
      this.inFlightRenewals.delete(depositKey);
    }
  }
}

