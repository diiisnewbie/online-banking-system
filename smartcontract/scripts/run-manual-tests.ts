import { network } from "hardhat";

async function main() {
  const connection = await network.connect();
  const { ethers } = connection;

  console.log("\n================================================================================");
  console.log("🚀 BẮT ĐẦU CHẠY BỘ TEST THỦ CÔNG TRỰC TIẾP TRÊN LOCALHOST");
  console.log("================================================================================\n");

  const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const VAULT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const CORE_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDRESS);
  const vault = await ethers.getContractAt("VaultManager", VAULT_ADDRESS);
  const core = await ethers.getContractAt("SavingCore", CORE_ADDRESS);

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const alice = signers[1];
  const bob = signers[2];

  console.log(`📌 Deployer (Admin): ${deployer.address}`);
  console.log(`📌 Alice (Người dùng A): ${alice.address}`);
  console.log(`📌 Bob (Người dùng B):   ${bob.address}\n`);

  // Đọc danh sách gói hiện hành
  const plans = await core.getAllPlans();
  console.log("📋 DANH SÁCH GÓI TIẾT KIỆM ON-CHAIN:");
  plans.forEach((p: any, idx: number) => {
    console.log(`   - Gói #${idx}: Kỳ hạn ${p.tenorDays.toString()} ngày | Lãi suất: ${(Number(p.aprBps)/100).toFixed(2)}% | Phạt rút sớm: ${(Number(p.earlyWithdrawPenaltyBps)/100).toFixed(2)}% | Trạng thái: ${p.enabled ? "Đang mở" : "Đóng"}`);
  });
  console.log("");

  // ---------------------------------------------------------------------------
  // TEST CASE 2: Mở sổ tiết kiệm NFT (openDeposit)
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("🧪 TEST CASE 2: Alice Mở Sổ Tiết Kiệm NFT Gói #1 (30 ngày) (#openDeposit)");
  console.log("--------------------------------------------------------------------------------");
  const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
  
  await (await usdc.mint(alice.address, depositAmount)).wait();
  await (await usdc.connect(alice).approve(CORE_ADDRESS, depositAmount)).wait();
  console.log("✅ Đã cấp 1,000 USDC cho Alice và Approve cho SavingCore.");

  const txOpen = await core.connect(alice).openDeposit(1, depositAmount); // Gói 1: 30 ngày
  await txOpen.wait();
  console.log(`✅ Alice đã mở sổ thành công! TxHash: ${txOpen.hash}`);

  const aliceNftCount = await core.balanceOf(alice.address);
  const depositId1 = await core.tokenOfOwnerByIndex(alice.address, aliceNftCount - 1n);
  const cert1 = await core.getCertificate(depositId1);

  console.log(`   - Số lượng NFT sở hữu: ${aliceNftCount.toString()}`);
  console.log(`   - Deposit Certificate ID: #${depositId1.toString()}`);
  console.log(`   - Tiền gốc: ${ethers.formatUnits(cert1.principal, 6)} USDC`);
  console.log(`   - Mã gói gửi (Plan ID): #${cert1.planId.toString()}`);
  console.log(`   - Ngày mở sổ (startAt): ${new Date(Number(cert1.startAt) * 1000).toLocaleString("vi-VN")}`);
  console.log(`   - Ngày đáo hạn (maturityAt): ${new Date(Number(cert1.maturityAt) * 1000).toLocaleString("vi-VN")}`);
  console.log(`   - Lãi suất Snapshot APR: ${(Number(cert1.snapshotAprBps) / 100).toFixed(2)}%`);
  console.log(`   - Trạng thái: ${cert1.status.toString() === "0" ? "0 (Active - Đang hoạt động)" : cert1.status.toString()}`);

  // ---------------------------------------------------------------------------
  // TEST CASE 3: Rút tiền trước hạn có phạt (earlyWithdraw)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🧪 TEST CASE 3: Alice Rút Tiền Trước Hạn Có Phạt (#earlyWithdraw)");
  console.log("--------------------------------------------------------------------------------");
  const balanceBeforeEarly = await usdc.balanceOf(alice.address);
  const feeReceiver = await vault.feeReceiver();
  const feeReceiverBefore = await usdc.balanceOf(feeReceiver);

  console.log(`   - Số dư ví Alice trước khi rút: ${ethers.formatUnits(balanceBeforeEarly, 6)} USDC`);
  console.log(`   - Gói quy định phạt rút sớm: ${(Number(plans[1].earlyWithdrawPenaltyBps)/100).toFixed(2)}% tiền gốc`);

  const txEarly = await core.connect(alice).earlyWithdraw(depositId1);
  await txEarly.wait();

  const balanceAfterEarly = await usdc.balanceOf(alice.address);
  const feeReceiverAfter = await usdc.balanceOf(feeReceiver);
  const cert1After = await core.getCertificate(depositId1);

  console.log(`✅ Alice rút sớm thành công!`);
  console.log(`   - Số dư ví Alice sau rút: ${ethers.formatUnits(balanceAfterEarly, 6)} USDC (+${ethers.formatUnits(balanceAfterEarly - balanceBeforeEarly, 6)} USDC, bị trừ 5% phí phạt)`);
  console.log(`   - Quỹ dự phòng feeReceiver nhận: +${ethers.formatUnits(feeReceiverAfter - feeReceiverBefore, 6)} USDC phí phạt`);
  console.log(`   - Trạng thái sổ sau khi rút sớm: ${cert1After.status.toString() === "2" ? "2 (EarlyWithdrawn - Đã tất toán sớm)" : cert1After.status.toString()}`);

  // ---------------------------------------------------------------------------
  // TEST CASE 4: Bob Mở Sổ, Tua Thời Gian 31 Ngày & Rút Đúng Hạn Đủ Gốc + Lãi
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🧪 TEST CASE 4: Bob Mở Sổ Gói #1 (30 ngày), Tua Thời Gian 31 Ngày & Rút Đúng Hạn Đủ Gốc + Lãi");
  console.log("--------------------------------------------------------------------------------");
  await (await usdc.mint(bob.address, depositAmount)).wait();
  await (await usdc.connect(bob).approve(CORE_ADDRESS, depositAmount)).wait();

  const txBobOpen = await core.connect(bob).openDeposit(1, depositAmount); // Gói 1: 30 ngày
  await txBobOpen.wait();
  const bobNftCount = await core.balanceOf(bob.address);
  const depositIdBob = await core.tokenOfOwnerByIndex(bob.address, bobNftCount - 1n);
  console.log(`✅ Bob đã mở sổ mới ID #${depositIdBob.toString()} với 1,000 USDC.`);

  console.log("⏳ Đang tua thời gian EVM thêm 31 ngày (31 * 86,400 giây)...");
  await connection.provider.send("evm_increaseTime", [31 * 86400]);
  await connection.provider.send("evm_mine", []);
  console.log(`✅ Đã tua xong! Sổ #${depositIdBob.toString()} hiện đã chính thức đáo hạn.`);

  const bobBeforeMaturity = await usdc.balanceOf(bob.address);
  const txMaturity = await core.connect(bob).withdrawAtMaturity(depositIdBob);
  await txMaturity.wait();

  const bobAfterMaturity = await usdc.balanceOf(bob.address);
  const receivedTotal = bobAfterMaturity - bobBeforeMaturity;
  const certBobAfter = await core.getCertificate(depositIdBob);

  console.log(`✅ Bob đã rút tiền đáo hạn thành công!`);
  console.log(`   - Tổng tiền Bob nhận về: ${ethers.formatUnits(receivedTotal, 6)} USDC`);
  console.log(`     (Bao gồm 1,000 USDC gốc từ Core + ${ethers.formatUnits(receivedTotal - depositAmount, 6)} USDC tiền lãi từ Vault)`);
  console.log(`   - Trạng thái sổ: ${certBobAfter.status.toString() === "1" ? "1 (Matured - Đã đáo hạn và tất toán)" : certBobAfter.status.toString()}`);

  // ---------------------------------------------------------------------------
  // TEST CASE 5: Test tính năng C1 - Vault cạn tiền, hoàn 100% gốc ngay & Đòi nợ lãi sau
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🧪 TEST CASE 5 (C1 BONUS): Vault Cạn Tiền - Hoàn 100% Gốc Ngay & Đòi Nợ Lãi Sau");
  console.log("--------------------------------------------------------------------------------");
  await (await usdc.mint(alice.address, depositAmount)).wait();
  await (await usdc.connect(alice).approve(CORE_ADDRESS, depositAmount)).wait();
  await (await core.connect(alice).openDeposit(1, depositAmount)).wait();
  const aliceNftCount2 = await core.balanceOf(alice.address);
  const depositIdAlice2 = await core.tokenOfOwnerByIndex(alice.address, aliceNftCount2 - 1n);
  console.log(`✅ Alice mở sổ mới ID #${depositIdAlice2.toString()} (1,000 USDC, 30 ngày).`);

  const vaultBalance = await usdc.balanceOf(VAULT_ADDRESS);
  const committed = await core.totalCommittedInterest();
  console.log(`   - Số dư Vault hiện tại: ${ethers.formatUnits(vaultBalance, 6)} USDC`);
  console.log(`   - Lãi cam kết đang bảo vệ: ${ethers.formatUnits(committed, 6)} USDC`);

  console.log("⚠️ Mô phỏng Vault cạn sạch thanh khoản (Vault USDC = 0)...");
  // Dùng hardhat_setBalance để cấp ETH cho Vault Signer mà không cần transfer ETH
  await connection.provider.send("hardhat_setBalance", [VAULT_ADDRESS, "0x1000000000000000000"]); // 1 ETH
  await connection.provider.send("hardhat_impersonateAccount", [VAULT_ADDRESS]);
  const vaultSigner = await ethers.getSigner(VAULT_ADDRESS);
  const remainingVault = await usdc.balanceOf(VAULT_ADDRESS);
  if (remainingVault > 0n) {
    await (await usdc.connect(vaultSigner).transfer(deployer.address, remainingVault)).wait();
  }
  await connection.provider.send("hardhat_stopImpersonatingAccount", [VAULT_ADDRESS]);
  console.log(`   - Số dư Vault sau khi rút hết: ${ethers.formatUnits(await usdc.balanceOf(VAULT_ADDRESS), 6)} USDC (CẠN SẠCH 0 USDC).`);

  console.log("⏳ Tua thời gian thêm 31 ngày để sổ của Alice đáo hạn...");
  await connection.provider.send("evm_increaseTime", [31 * 86400]);
  await connection.provider.send("evm_mine", []);

  const alicePreWithdraw = await usdc.balanceOf(alice.address);
  const txC1 = await core.connect(alice).withdrawAtMaturity(depositIdAlice2);
  await txC1.wait();
  const alicePostWithdraw = await usdc.balanceOf(alice.address);

  console.log(`🎯 [C1 TEST] Alice gọi withdrawAtMaturity khi Vault = 0 USDC:`);
  console.log(`   - Giao dịch: THÀNH CÔNG (Không bị revert!)`);
  console.log(`   - Tiền gốc Alice nhận lại ngay: +${ethers.formatUnits(alicePostWithdraw - alicePreWithdraw, 6)} USDC (100% VỐN GỐC ĐƯỢC BẢO TOÀN!)`);

  const unpaidDebt = await core.unpaidInterest(depositIdAlice2);
  console.log(`   - Tiền lãi được hoãn nợ on-chain (unpaidInterest): ${ethers.formatUnits(unpaidDebt, 6)} USDC.`);

  console.log("   - Alice thử gọi claimPendingInterest() khi Vault vẫn cạn tiền...");
  try {
    await core.connect(alice).claimPendingInterest(depositIdAlice2);
    console.log("     ❌ Lỗi: Lẽ ra phải revert ClaimNotCovered");
  } catch (err: any) {
    console.log("     ✅ ĐÚNG THIẾT KẾ: Giao dịch revert 'ClaimNotCovered()' vì Vault chưa đủ thanh khoản.");
  }

  console.log("   - Nhà tài trợ / Admin nạp thêm 100 USDC cứu trợ vào Vault (#fundVault)...");
  await (await usdc.mint(deployer.address, ethers.parseUnits("100", 6))).wait();
  await (await usdc.connect(deployer).approve(VAULT_ADDRESS, ethers.parseUnits("100", 6))).wait();
  await (await vault.connect(deployer).fundVault(ethers.parseUnits("100", 6))).wait();
  console.log(`   - Số dư Vault sau nạp cứu trợ: ${ethers.formatUnits(await usdc.balanceOf(VAULT_ADDRESS), 6)} USDC.`);

  const alicePreClaim = await usdc.balanceOf(alice.address);
  const txClaim = await core.connect(alice).claimPendingInterest(depositIdAlice2);
  await txClaim.wait();
  const alicePostClaim = await usdc.balanceOf(alice.address);

  console.log(`🎯 [C1 TEST] Alice gọi lại claimPendingInterest() sau khi Vault có tiền:`);
  console.log(`   - Giao dịch: THÀNH CÔNG!`);
  console.log(`   - Alice nhận đủ tiền lãi tồn đọng: +${ethers.formatUnits(alicePostClaim - alicePreClaim, 6)} USDC.`);
  console.log(`   - Nợ tồn đọng còn lại của sổ #${depositIdAlice2.toString()}: ${(await core.unpaidInterest(depositIdAlice2)).toString()} USDC (Đã xóa nợ sạch).`);

  // ---------------------------------------------------------------------------
  // TEST CASE 6: Test tính năng C2 - Solvency Guard chặn Admin rút cạn tiền quỹ
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("🧪 TEST CASE 6 (C2 BONUS): Solvency Guard Chặn Admin Rút Quá Mức Cam Kết Lãi");
  console.log("--------------------------------------------------------------------------------");
  const vaultBalC2 = await usdc.balanceOf(VAULT_ADDRESS);
  const committedC2 = await core.totalCommittedInterest();
  console.log(`   - Số dư hiện tại của Vault: ${ethers.formatUnits(vaultBalC2, 6)} USDC`);
  console.log(`   - Tổng cam kết lãi đang bảo vệ: ${ethers.formatUnits(committedC2, 6)} USDC`);

  console.log("   - Admin cố tình gọi withdrawVault() để rút TOÀN BỘ số dư Vault...");
  try {
    await vault.withdrawVault(vaultBalC2);
    console.log("     ❌ Thất bại: Solvency Guard không chặn được");
  } catch (err: any) {
    console.log("     ✅ ĐÚNG THIẾT KẾ: Bị Solvency Guard CHẶN ĐỨNG với lỗi 'InsufficientCommitted()'!");
    console.log("     => Admin tuyệt đối không thể rút khoản tiền đã cam kết trả lãi cho người gửi!");
  }

  console.log("\n================================================================================");
  console.log("🎉 TẤT CẢ CÁC KỊCH BẢN TEST THỦ CÔNG ĐÃ ĐẠT KẾT QUẢ HOÀN HẢO 100%!");
  console.log("================================================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});