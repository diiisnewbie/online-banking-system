// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";

contract SavingCore is ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Enums and Structs ---
    enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }

    struct SavingPlan {
        uint256 planId;
        uint256 tenorDays;                // K? h?n (7, 30, 90, 180, 365 ngày...)
        uint256 aprBps;                   // Lãi su?t nam (1 bps = 0.01%; 225 bps = 2.25%)
        uint256 minDeposit;               // T?i thi?u (0 = không gi?i h?n)
        uint256 maxDeposit;               // T?i da (0 = không gi?i h?n)
        uint256 earlyWithdrawPenaltyBps;  // Ph?t rút s?m (500 bps = 5.00%)
        bool enabled;                     // Nh?n kho?n g?i m?i?
    }

    struct DepositCertificate {
        uint256 depositId;                // Token ID c?a ERC-721 NFT
        uint256 planId;
        uint256 principal;                // Ti?n g?c (6 decimals)
        uint256 startAt;                  // block.timestamp b?t d?u
        uint256 maturityAt;               // startAt + tenorSeconds
        uint256 aprBpsAtOpen;             // Snapshot APR (B?T BI?N)
        uint256 penaltyBpsAtOpen;         // Snapshot phí ph?t (B?T BI?N)
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

    // --- Events ---
    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
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

    // --- State Variables ---
    IERC20 public immutable usdc;
    IVaultManager public immutable vault;
    uint256 public immutable gracePeriod;
    uint256 public planCount;
    uint256 public nextDepositId = 1;

    mapping(uint256 => SavingPlan) public plans;
    mapping(uint256 => DepositCertificate) public certificates;

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
        uint256 plan0Max
    ) ERC721("Term Deposit Certificate", "TDC") Ownable(initialOwner) {
        if (address(usdc_) == address(0) || address(vault_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
        vault = vault_;
        gracePeriod = gracePeriod_;

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
        uint256 maturityAt = block.timestamp + plan.tenorDays * 1 days;

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

        emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt, plan.aprBps);

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _safeMint(msg.sender, depositId);
    }

    function _calcInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds) internal pure returns (uint256) {
        return (principal * aprBps * tenorSeconds) / (365 days * 10000);
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
}
