// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";
import {ISavingCore} from "./interfaces/ISavingCore.sol";

contract SavingCore is ISavingCore, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums and Structs ---
    enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }

    struct SavingPlan {
        uint256 planId;
        uint256 tenorDays;                // Ky han (7, 30, 90, 180, 365 ngay...)
        uint256 aprBps;                   // Lai suat nam (1 bps = 0.01%; 225 bps = 2.25%)
        uint256 minDeposit;               // Toi thieu (0 = khong gioi han)
        uint256 maxDeposit;               // Toi da (0 = khong gioi han)
        uint256 earlyWithdrawPenaltyBps;  // Phat rut som (500 bps = 5.00%)
        bool enabled;                     // Nhan khoan goi moi?
    }

    struct DepositCertificate {
        uint256 depositId;                // Token ID cua ERC-721 NFT
        uint256 planId;
        uint256 principal;                // Tien goc (6 decimals)
        uint256 startAt;                  // block.timestamp bat dau
        uint256 maturityAt;               // startAt + tenorSeconds
        uint256 aprBpsAtOpen;             // Snapshot APR (BAT BIEN)
        uint256 penaltyBpsAtOpen;         // Snapshot phi phat (BAT BIEN)
        DepositStatus status;
    }

    // --- Custom Errors ---
    error PlanNotFound(uint256 planId);
    error PlanDisabled();
    error InvalidDepositAmount();
    error InvalidPlanParams();
    error SystemPaused();
    error ZeroAddress();
    error DepositNotFound(uint256 depositId);
    error NotDepositOwner();
    error DepositNotActive();
    error NotMatured();
    error AlreadyMatured();
    // Declared in SavingCore to decode ABI when bubbling up from VaultManager.payoutInterest:
    error InsufficientVaultLiquidity();
    error ClaimNotCovered();
    error NoPendingInterest();
    error TransferDisabledForClosedCertificate();

    // --- Events ---
    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
    event PlanCreatedWithUnit(uint256 indexed planId, uint256 tenorUnits, uint256 aprBps, uint256 timeUnitSeconds);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event PlanToggled(uint256 indexed planId, bool enabled);
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 newPlanId
    );
    event PenaltyCharged(
        uint256 indexed depositId,
        address indexed receiver,
        uint256 penalty
    );
    event InterestDeferred(
        uint256 indexed depositId,
        address indexed owner,
        uint256 amount
    );
    event InterestClaimed(
        uint256 indexed depositId,
        address indexed claimer,
        uint256 amount
    );

    // --- State Variables ---
    IERC20 public immutable usdc;
    IVaultManager public immutable vault;
    uint256 public immutable gracePeriod;
    uint256 public immutable timeUnit;
    uint256 public planCount;
    uint256 public nextDepositId = 1;

    uint256 public override totalCommittedInterest;
    mapping(uint256 => uint256) public unpaidInterest;

    mapping(uint256 => SavingPlan) public plans;
    mapping(uint256 => DepositCertificate) public certificates;
    mapping(uint256 => uint256) public planTimeUnit;

    modifier whenSystemNotPaused() {
        if (vault.paused()) revert SystemPaused();
        _;
    }

    constructor(
        IERC20 usdc_,
        IVaultManager vault_,
        address initialOwner,
        uint256 gracePeriod_,
        uint256 plan0TenorDays,
        uint256 plan0AprBps,
        uint256 plan0PenaltyBps,
        uint256 plan0Min,
        uint256 plan0Max,
        uint256 timeUnit_
    ) ERC721("Term Deposit Certificate", "TDC") Ownable(initialOwner) {
        if (address(usdc_) == address(0) || address(vault_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
        vault = vault_;
        gracePeriod = gracePeriod_;
        timeUnit = timeUnit_ == 0 ? 1 days : timeUnit_;

        _createPlan(plan0TenorDays, plan0AprBps, plan0Min, plan0Max, plan0PenaltyBps);
    }

    function _createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 penaltyBps
    ) internal returns (uint256 planId) {
        if (tenorDays < 1 || tenorDays > 3650) revert InvalidPlanParams();
        if (aprBps < 1 || aprBps > 10000) revert InvalidPlanParams();
        if (penaltyBps > 10000) revert InvalidPlanParams();
        if (minDeposit > 0 && maxDeposit > 0 && minDeposit > maxDeposit) revert InvalidPlanParams();

        planId = planCount++;
        plans[planId] = SavingPlan({
            planId: planId,
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: penaltyBps,
            enabled: true
        });

        emit PlanCreated(planId, tenorDays, aprBps);
    }

    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 penaltyBps
    ) external onlyOwner returns (uint256) {
        return _createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps);
    }

    function createPlanWithCustomUnit(
        uint256 tenorUnits,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 penaltyBps,
        uint256 customTimeUnit
    ) external onlyOwner returns (uint256 planId) {
        planId = _createPlan(tenorUnits, aprBps, minDeposit, maxDeposit, penaltyBps);
        if (customTimeUnit > 0) {
            planTimeUnit[planId] = customTimeUnit;
        }
        emit PlanCreatedWithUnit(planId, tenorUnits, aprBps, getPlanTimeUnit(planId));
    }

    function getPlanTimeUnit(uint256 planId) public view returns (uint256) {
        uint256 u = planTimeUnit[planId];
        return u == 0 ? timeUnit : u;
    }

    function getPlanDurationSeconds(uint256 planId) public view returns (uint256) {
        if (planId >= planCount) revert PlanNotFound(planId);
        return plans[planId].tenorDays * getPlanTimeUnit(planId);
    }

    function getPlanGracePeriod(uint256 planId) public view returns (uint256) {
        uint256 u = getPlanTimeUnit(planId);
        if (u <= 60) {
            return 60; // 1 phut an han cho cac goi demo phut
        }
        return gracePeriod;
    }

    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        if (planId >= planCount) revert PlanNotFound(planId);
        if (newAprBps < 1 || newAprBps > 10000) revert InvalidPlanParams();
        plans[planId].aprBps = newAprBps;
        emit PlanUpdated(planId, newAprBps);
    }

    function enablePlan(uint256 planId) external onlyOwner {
        if (planId >= planCount) revert PlanNotFound(planId);
        plans[planId].enabled = true;
        emit PlanToggled(planId, true);
    }

    function disablePlan(uint256 planId) external onlyOwner {
        if (planId >= planCount) revert PlanNotFound(planId);
        plans[planId].enabled = false;
        emit PlanToggled(planId, false);
    }

    function openDeposit(uint256 planId, uint256 amount) external whenSystemNotPaused nonReentrant returns (uint256 depositId) {
        if (planId >= planCount) revert PlanNotFound(planId);
        SavingPlan storage plan = plans[planId];
        if (!plan.enabled) revert PlanDisabled();
        if (amount == 0) revert InvalidDepositAmount();
        if (plan.minDeposit > 0 && amount < plan.minDeposit) revert InvalidDepositAmount();
        if (plan.maxDeposit > 0 && amount > plan.maxDeposit) revert InvalidDepositAmount();

        depositId = nextDepositId++;
        uint256 tenorSeconds = getPlanDurationSeconds(planId);
        uint256 maturityAt = block.timestamp + tenorSeconds;

        certificates[depositId] = DepositCertificate({
            depositId: depositId,
            planId: planId,
            principal: amount,
            startAt: block.timestamp,
            maturityAt: maturityAt,
            aprBpsAtOpen: plan.aprBps,
            penaltyBpsAtOpen: plan.earlyWithdrawPenaltyBps,
            status: DepositStatus.Active
        });

        uint256 interest = _calcInterest(amount, plan.aprBps, tenorSeconds);
        totalCommittedInterest += interest;

        emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt, plan.aprBps);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _safeMint(msg.sender, depositId);
    }

    function withdrawAtMaturity(uint256 depositId) external whenSystemNotPaused nonReentrant {
        if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
        if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();

        DepositCertificate storage cert = certificates[depositId];
        if (cert.status != DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp < cert.maturityAt) revert NotMatured();

        cert.status = DepositStatus.Withdrawn;

        uint256 principal = cert.principal;
        uint256 interest = _interestOf(cert);
        bool payNow = usdc.balanceOf(address(vault)) >= interest;

        if (payNow) {
            totalCommittedInterest -= interest;
        } else {
            unpaidInterest[depositId] += interest;
        }

        usdc.safeTransfer(msg.sender, principal);

        if (payNow) {
            vault.payoutInterest(msg.sender, interest);
            emit Withdrawn(depositId, msg.sender, principal, interest, false);
        } else {
            emit Withdrawn(depositId, msg.sender, principal, 0, false);
            emit InterestDeferred(depositId, msg.sender, interest);
        }
    }

    function earlyWithdraw(uint256 depositId) external whenSystemNotPaused nonReentrant {
        if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
        if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();

        DepositCertificate storage cert = certificates[depositId];
        if (cert.status != DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp >= cert.maturityAt) revert AlreadyMatured();

        cert.status = DepositStatus.Withdrawn;

        uint256 principal = cert.principal;
        uint256 plannedInterest = _interestOf(cert);
        totalCommittedInterest -= plannedInterest;

        uint256 penalty = (principal * cert.penaltyBpsAtOpen) / 10000;
        uint256 amountToUser = principal - penalty;

        if (penalty > 0) {
            address receiver = vault.feeReceiver();
            emit PenaltyCharged(depositId, receiver, penalty);
            usdc.safeTransfer(receiver, penalty);
        }

        emit Withdrawn(depositId, msg.sender, principal, 0, true);
        usdc.safeTransfer(msg.sender, amountToUser);
    }

    function renewDeposit(uint256 oldDepositId, uint256 newPlanId) external whenSystemNotPaused nonReentrant returns (uint256 newDepositId) {
        if (oldDepositId == 0 || oldDepositId >= nextDepositId) revert DepositNotFound(oldDepositId);
        if (ownerOf(oldDepositId) != msg.sender) revert NotDepositOwner();

        DepositCertificate storage oldCert = certificates[oldDepositId];
        if (oldCert.status != DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp < oldCert.maturityAt) revert NotMatured();

        if (newPlanId >= planCount) revert PlanNotFound(newPlanId);
        SavingPlan storage newPlan = plans[newPlanId];
        if (!newPlan.enabled) revert PlanDisabled();

        uint256 oldInterest = _calcInterest(oldCert.principal, oldCert.aprBpsAtOpen, oldCert.maturityAt - oldCert.startAt);
        uint256 newPrincipal = oldCert.principal + oldInterest;

        if (newPlan.minDeposit > 0 && newPrincipal < newPlan.minDeposit) revert InvalidDepositAmount();
        if (newPlan.maxDeposit > 0 && newPrincipal > newPlan.maxDeposit) revert InvalidDepositAmount();

        oldCert.status = DepositStatus.ManualRenewed;

        newDepositId = nextDepositId++;
        uint256 tenorSeconds = getPlanDurationSeconds(newPlanId);
        uint256 newMaturityAt = block.timestamp + tenorSeconds;

        certificates[newDepositId] = DepositCertificate({
            depositId: newDepositId,
            planId: newPlanId,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: newMaturityAt,
            aprBpsAtOpen: newPlan.aprBps,
            penaltyBpsAtOpen: newPlan.earlyWithdrawPenaltyBps,
            status: DepositStatus.Active
        });

        uint256 newInterest = _calcInterest(newPrincipal, newPlan.aprBps, tenorSeconds);
        totalCommittedInterest = totalCommittedInterest - oldInterest + newInterest;

        emit Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId);

        vault.payoutInterest(address(this), oldInterest);
        _safeMint(msg.sender, newDepositId);
    }

    function autoRenewDeposit(uint256 oldDepositId) external whenSystemNotPaused nonReentrant returns (uint256 newDepositId) {
        if (oldDepositId == 0 || oldDepositId >= nextDepositId) revert DepositNotFound(oldDepositId);

        DepositCertificate storage oldCert = certificates[oldDepositId];
        if (oldCert.status != DepositStatus.Active) revert DepositNotActive();
        uint256 planGrace = getPlanGracePeriod(oldCert.planId);
        if (block.timestamp < oldCert.maturityAt + planGrace) revert NotMatured();

        uint256 oldTenor = oldCert.maturityAt - oldCert.startAt;
        uint256 oldInterest = _calcInterest(oldCert.principal, oldCert.aprBpsAtOpen, oldTenor);
        uint256 newPrincipal = oldCert.principal + oldInterest;

        address owner = ownerOf(oldDepositId);

        oldCert.status = DepositStatus.AutoRenewed;

        newDepositId = nextDepositId++;
        uint256 newStartAt = oldCert.maturityAt;
        uint256 newMaturityAt = oldCert.maturityAt + oldTenor;

        certificates[newDepositId] = DepositCertificate({
            depositId: newDepositId,
            planId: oldCert.planId,
            principal: newPrincipal,
            startAt: newStartAt,
            maturityAt: newMaturityAt,
            aprBpsAtOpen: oldCert.aprBpsAtOpen,
            penaltyBpsAtOpen: oldCert.penaltyBpsAtOpen,
            status: DepositStatus.Active
        });

        uint256 newInterest = _calcInterest(newPrincipal, oldCert.aprBpsAtOpen, oldTenor);
        totalCommittedInterest = totalCommittedInterest - oldInterest + newInterest;

        emit Renewed(oldDepositId, newDepositId, newPrincipal, oldCert.planId);

        vault.payoutInterest(address(this), oldInterest);
        _mint(owner, newDepositId);
    }

    function _calcInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds) internal pure returns (uint256) {
        return (principal * aprBps * tenorSeconds) / (365 days * 10000);
    }

    function _interestOf(DepositCertificate storage cert) internal view returns (uint256) {
        return _calcInterest(cert.principal, cert.aprBpsAtOpen, cert.maturityAt - cert.startAt);
    }

    function claimPendingInterest(uint256 depositId) external whenSystemNotPaused nonReentrant {
        if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
        if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();

        uint256 unpaid = unpaidInterest[depositId];
        if (unpaid == 0) revert NoPendingInterest();

        if (usdc.balanceOf(address(vault)) < unpaid) revert ClaimNotCovered();

        // Effects truoc
        unpaidInterest[depositId] = 0;
        totalCommittedInterest -= unpaid;

        // Interactions
        vault.payoutInterest(msg.sender, unpaid);
        emit InterestClaimed(depositId, msg.sender, unpaid);
    }

    function previewInterest(uint256 depositId) external view returns (uint256) {
        if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
        DepositCertificate storage cert = certificates[depositId];
        return _calcInterest(cert.principal, cert.aprBpsAtOpen, cert.maturityAt - cert.startAt);
    }

    function getPlan(uint256 planId) external view returns (SavingPlan memory) {
        if (planId >= planCount) revert PlanNotFound(planId);
        return plans[planId];
    }

    function getCertificate(uint256 depositId) external view returns (DepositCertificate memory) {
        if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
        return certificates[depositId];
    }

    /// @notice Tra ve toan bo danh sach cac goi tiet kiem de Frontend doc on-chain [D29]
    /// @dev Trade-off: Khong phan trang, phu hop quy mo demo/do an. Production nen dung indexer hoac phan trang.
    function getAllPlans() external view returns (SavingPlan[] memory allPlans) {
        allPlans = new SavingPlan[](planCount);
        for (uint256 i = 0; i < planCount; i++) {
            allPlans[i] = plans[i];
        }
    }

    /// @notice Tra ve toan bo cac chung chi thuoc so huu cua mot dia chi vi
    /// @dev Doi ten tham so thanh account de tranh shadow ham owner() cua Ownable.
    /// Tra ve ca cert da Withdrawn/Renewed (D8 khong burn NFT); Frontend se loc theo cert.status == Active.
    function getCertificatesOfOwner(address account) external view returns (DepositCertificate[] memory certs) {
        uint256 count = balanceOf(account);
        certs = new DepositCertificate[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 depositId = tokenOfOwnerByIndex(account, i);
            certs[i] = certificates[depositId];
        }
    }

    /// @notice Hook chan chuyen nhuong NFT neu so da tat toan va khong con no lai C1
    /// @dev Ngan chan 100% hanh vi dem NFT da rut het tien di ban/lua dao tren MetaMask hoac OpenSea
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            DepositCertificate storage cert = certificates[tokenId];
            bool hasPendingInterest = (unpaidInterest[tokenId] > 0);
            if (cert.status != DepositStatus.Active && !hasPendingInterest) {
                revert TransferDisabledForClosedCertificate();
            }
        }
        return super._update(to, tokenId, auth);
    }
}
