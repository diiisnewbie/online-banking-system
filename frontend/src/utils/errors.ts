import { ethers } from 'ethers';

/**
 * Giải mã lỗi trả về từ smart contract hoặc provider thành thông báo tiếng Việt thân thiện
 */
export function parseContractError(
  err: any,
  contracts?: { core?: ethers.Contract | null; vault?: ethers.Contract | null }
): string {
  // 1. Người dùng từ chối ký giao dịch trong ví (EIP-1193 code 4001 hoặc ACTION_REJECTED)
  if (
    err?.code === 4001 ||
    err?.code === 'ACTION_REJECTED' ||
    err?.info?.error?.code === 4001 ||
    err?.message?.includes('user rejected') ||
    err?.message?.includes('User denied')
  ) {
    return 'Giao dịch đã bị hủy bởi người dùng.';
  }

  // 2. Trích xuất data error (EVM revert data)
  const errorData =
    err?.data ||
    err?.error?.data ||
    err?.info?.error?.data ||
    err?.receipt?.revertReason;

  if (errorData && typeof errorData === 'string' && contracts) {
    // Thử decode với SavingCore interface
    if (contracts.core) {
      try {
        const parsed = contracts.core.interface.parseError(errorData);
        if (parsed) {
          return mapCustomErrorToMessage(parsed.name, parsed.args);
        }
      } catch {
        // Tiếp tục thử với VaultManager
      }
    }

    // Thử decode với VaultManager interface
    if (contracts.vault) {
      try {
        const parsed = contracts.vault.interface.parseError(errorData);
        if (parsed) {
          return mapCustomErrorToMessage(parsed.name, parsed.args);
        }
      } catch {
        // Không decode được
      }
    }
  }

  // 3. Kiểm tra error message dạng chuỗi chứa tên Custom Error
  const errMsg = err?.message || err?.toString() || '';
  const knownErrors = [
    'NotMatured',
    'AlreadyMatured',
    'DepositNotActive',
    'NotDepositOwner',
    'DepositNotFound',
    'PlanDisabled',
    'InvalidDepositAmount',
    'InsufficientVaultLiquidity',
    'ClaimNotCovered',
    'NoPendingInterest',
    'SystemPaused',
    'InsufficientCommitted',
    'AmountExceedsBalance',
    'ZeroAddress',
    'EnforcedPause'
  ];

  for (const errorName of knownErrors) {
    if (errMsg.includes(errorName)) {
      return mapCustomErrorToMessage(errorName);
    }
  }

  // 4. Lỗi kết nối mạng hoặc RPC
  if (errMsg.includes('could not detect network') || errMsg.includes('connection refused') || errMsg.includes('network error')) {
    return 'Lỗi kết nối mạng: Vui lòng kiểm tra Hardhat node local (127.0.0.1:8545).';
  }

  if (errMsg.includes('nonce has already been used') || errMsg.includes('NONCE_EXPIRED')) {
    return 'Lệch Nonce MetaMask: Vui lòng vào Cài đặt -> Nâng cao -> Xóa dữ liệu hoạt động của tab (Clear activity tab data).';
  }

  // 5. Thông báo lỗi mặc định tóm tắt
  return `Lỗi giao dịch: ${errMsg.slice(0, 160)}${errMsg.length > 160 ? '...' : ''}`;
}

function mapCustomErrorToMessage(errorName: string, args?: any): string {
  switch (errorName) {
    case 'NotMatured':
      return 'Khoản tiền gửi chưa đến ngày đáo hạn (hoặc chưa hết thời gian ân hạn 3 ngày).';
    case 'AlreadyMatured':
      return 'Khoản tiền gửi đã đáo hạn. Bạn không thể rút sớm, vui lòng chọn Rút đúng hạn.';
    case 'DepositNotActive':
      return 'Chứng chỉ này đã được tất toán hoặc đã được tái tục trước đó.';
    case 'NotDepositOwner':
      return 'Ví kết nối hiện tại không phải chủ sở hữu chứng chỉ NFT này.';
    case 'DepositNotFound':
      return `Không tìm thấy chứng chỉ tiền gửi trên hệ thống (ID: ${args?.[0] || 'không hợp lệ'}).`;
    case 'PlanDisabled':
      return 'Gói tiết kiệm này đã bị tạm dừng tiếp nhận khoản gửi mới.';
    case 'InvalidDepositAmount':
      return 'Số tiền gửi không thỏa hạn mức tối thiểu/tối đa của gói.';
    case 'InsufficientVaultLiquidity':
      return 'Quỹ trả lãi của ngân hàng tạm thời không đủ thanh khoản để hoàn tất giao dịch này.';
    case 'ClaimNotCovered':
      return 'Số dư quỹ Vault chưa đủ để thanh toán trọn vẹn khoản nợ lãi này (Cơ chế All-or-Nothing).';
    case 'NoPendingInterest':
      return 'Chứng chỉ này hiện không có khoản nợ lãi nào đang chờ thanh toán.';
    case 'SystemPaused':
    case 'EnforcedPause':
      return 'Hệ thống đang trong trạng thái tạm dừng khẩn cấp.';
    case 'InsufficientCommitted':
      return 'Giao dịch bị chặn: Số tiền rút vi phạm Solvency Guard C2 (quỹ bảo chứng cho các khoản lãi cam kết).';
    case 'AmountExceedsBalance':
      return 'Số tiền yêu cầu rút vượt quá số dư thực tế trong quỹ Vault.';
    case 'ZeroAddress':
      return 'Địa chỉ truyền vào không được là địa chỉ 0 (Zero Address).';
    default:
      return `Hợp đồng trả về lỗi: ${errorName}`;
  }
}

