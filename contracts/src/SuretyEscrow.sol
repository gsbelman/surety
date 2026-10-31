// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SuretyEscrow
/// @notice Bonded, self-settling USDC payments for AI agents and humans.
/// @dev A seller registers fixed terms and posts a bond. A buyer escrows a payment. The seller
/// delivers a proof hash before the deadline. If the seller stays silent, anyone can settle the
/// payment: the buyer gets a full refund plus a penalty from the seller's bond. After delivery the
/// buyer has an objection window. If the buyer does not object, anyone can release the funds.
///
/// All amounts use the ERC-20 interface of USDC (6 decimals). The contract never reads a native
/// balance or msg.value. The contract has no owner, no upgrade path, and no fee.
contract SuretyEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Delivered,
        Disputed,
        Released,
        Refunded
    }

    /// @dev Terms are set once at registration, so a seller cannot change them before a buyer's
    /// transaction lands. To change terms, a seller registers a new address.
    struct Seller {
        bool registered;
        uint16 penaltyBps;
        uint32 minDeliveryWindow;
        uint32 objectionWindow;
        address arbiter;
        uint256 bond;
        uint256 lockedBond;
        uint64 delivered;
        uint64 refunded;
        uint64 objected;
        uint64 declined;
    }

    struct Payment {
        address buyer;
        uint64 deliverBy;
        Status status;
        address seller;
        /// @dev The objection deadline while Delivered. The arbiter deadline while Disputed.
        uint64 decideBy;
        uint256 amount;
        uint256 penalty;
        bytes32 jobRef;
        bytes32 proofHash;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant USDC_DECIMALS = 6;
    uint32 public constant MAX_DELIVERY_WINDOW = 30 days;
    uint32 public constant MIN_OBJECTION_WINDOW = 30 seconds;
    uint32 public constant MAX_OBJECTION_WINDOW = 30 days;
    uint32 public constant ARBITER_WINDOW = 7 days;

    IERC20 public immutable token;

    uint256 public lastPaymentId;

    /// @notice USDC that a failed transfer left behind. See {claim}.
    mapping(address account => uint256 amount) public claimable;

    mapping(address seller => Seller) private _sellers;
    mapping(uint256 id => Payment) private _payments;

    event SellerRegistered(
        address indexed seller,
        uint16 penaltyBps,
        uint32 minDeliveryWindow,
        uint32 objectionWindow,
        address arbiter
    );
    event BondAdded(address indexed seller, uint256 amount, uint256 bond);
    event BondWithdrawn(address indexed seller, uint256 amount, uint256 bond);
    event Paid(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint256 penalty,
        uint64 deliverBy,
        bytes32 jobRef
    );
    event Delivered(uint256 indexed id, address indexed seller, bytes32 proofHash, uint64 objectBy);
    event Declined(uint256 indexed id, address indexed seller);
    event Objected(uint256 indexed id, address indexed buyer);
    event Disputed(uint256 indexed id, address indexed arbiter, uint64 resolveBy);
    event Resolved(uint256 indexed id, address indexed arbiter, bool refundBuyer);
    event Released(uint256 indexed id, address indexed seller, uint256 amount);
    event Refunded(uint256 indexed id, address indexed buyer, uint256 amount, uint256 penalty);
    event PayoutDeferred(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error WrongDecimals();
    error AlreadyRegistered();
    error NotRegistered();
    error BadTerms();
    error BadWindow();
    error SelfPayment();
    error InsufficientBond();
    error NotBuyer();
    error NotSeller();
    error NotArbiter();
    error WrongStatus();
    error TooLate();
    error TooEarly();
    error ZeroProof();
    error NothingToClaim();

    /// @param usdc The ERC-20 interface of USDC. Must report 6 decimals.
    constructor(IERC20 usdc) {
        if (address(usdc) == address(0)) revert ZeroAddress();
        if (IERC20Metadata(address(usdc)).decimals() != USDC_DECIMALS) revert WrongDecimals();
        token = usdc;
    }

    // ---------------------------------------------------------------------
    // Seller
    // ---------------------------------------------------------------------

    /// @notice Registers the caller as a seller with fixed terms.
    /// @param penaltyBps The share of each payment that the bond covers, in basis points.
    /// @param minDeliveryWindow The shortest delivery window that a buyer can request, in seconds.
    /// This floor stops a buyer who sets an impossible deadline to collect the penalty.
    /// @param objectionWindow The time that a buyer has to object after delivery, in seconds.
    /// @param arbiter The address that decides objections. Zero applies the MVP rule: an objection
    /// refunds the buyer and pays the penalty.
    function register(uint16 penaltyBps, uint32 minDeliveryWindow, uint32 objectionWindow, address arbiter) external {
        Seller storage s = _sellers[msg.sender];
        if (s.registered) revert AlreadyRegistered();
        if (
            penaltyBps > BPS || minDeliveryWindow == 0 || minDeliveryWindow > MAX_DELIVERY_WINDOW
                || objectionWindow < MIN_OBJECTION_WINDOW || objectionWindow > MAX_OBJECTION_WINDOW
                || arbiter == msg.sender
        ) revert BadTerms();

        s.registered = true;
        s.penaltyBps = penaltyBps;
        s.minDeliveryWindow = minDeliveryWindow;
        s.objectionWindow = objectionWindow;
        s.arbiter = arbiter;
        emit SellerRegistered(msg.sender, penaltyBps, minDeliveryWindow, objectionWindow, arbiter);
    }

    /// @notice Adds USDC to the caller's bond.
    function addBond(uint256 amount) external nonReentrant {
        Seller storage s = _sellers[msg.sender];
        if (!s.registered) revert NotRegistered();
        if (amount == 0) revert ZeroAmount();

        s.bond += amount;
        emit BondAdded(msg.sender, amount, s.bond);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraws bond that no open payment has locked.
    function withdrawBond(uint256 amount) external nonReentrant {
        Seller storage s = _sellers[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (amount > s.bond - s.lockedBond) revert InsufficientBond();

        s.bond -= amount;
        emit BondWithdrawn(msg.sender, amount, s.bond);
        token.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Payment lifecycle
    // ---------------------------------------------------------------------

    /// @notice Escrows USDC for a job and locks the matching penalty in the seller's bond.
    /// @param seller A registered seller. The seller's free bond must cover the penalty.
    /// @param amount The payment, in USDC base units (6 decimals).
    /// @param deliveryWindow The time that the seller has to deliver, in seconds.
    /// @param jobRef A caller-defined reference, for example the hash of the request.
    /// @return id The payment id.
    function pay(address seller, uint256 amount, uint32 deliveryWindow, bytes32 jobRef)
        external
        nonReentrant
        returns (uint256 id)
    {
        Seller storage s = _sellers[seller];
        if (!s.registered) revert NotRegistered();
        if (seller == msg.sender) revert SelfPayment();
        if (amount == 0) revert ZeroAmount();
        if (deliveryWindow < s.minDeliveryWindow || deliveryWindow > MAX_DELIVERY_WINDOW) revert BadWindow();

        uint256 penalty = (amount * s.penaltyBps) / BPS;
        if (penalty > s.bond - s.lockedBond) revert InsufficientBond();
        s.lockedBond += penalty;

        id = ++lastPaymentId;
        uint64 deliverBy = uint64(block.timestamp) + deliveryWindow;
        Payment storage p = _payments[id];
        p.buyer = msg.sender;
        p.deliverBy = deliverBy;
        p.status = Status.Pending;
        p.seller = seller;
        p.amount = amount;
        p.penalty = penalty;
        p.jobRef = jobRef;

        emit Paid(id, msg.sender, seller, amount, penalty, deliverBy, jobRef);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Records delivery and starts the objection window.
    /// @param proofHash The hash of the response or receipt.
    function deliver(uint256 id, bytes32 proofHash) external {
        Payment storage p = _payments[id];
        if (msg.sender != p.seller) revert NotSeller();
        if (p.status != Status.Pending) revert WrongStatus();
        if (block.timestamp > p.deliverBy) revert TooLate();
        if (proofHash == bytes32(0)) revert ZeroProof();

        uint64 objectBy = uint64(block.timestamp) + _sellers[p.seller].objectionWindow;
        p.status = Status.Delivered;
        p.proofHash = proofHash;
        p.decideBy = objectBy;
        emit Delivered(id, msg.sender, proofHash, objectBy);
    }

    /// @notice Refunds the buyer without penalty before the deadline.
    /// @dev A seller uses this to reject a job that the seller cannot do or never agreed to. After
    /// the deadline the seller cannot decline, so a silent seller cannot escape the penalty.
    function decline(uint256 id) external nonReentrant {
        Payment storage p = _payments[id];
        if (msg.sender != p.seller) revert NotSeller();
        if (p.status != Status.Pending) revert WrongStatus();
        if (block.timestamp > p.deliverBy) revert TooLate();

        Seller storage s = _sellers[p.seller];
        p.status = Status.Refunded;
        s.lockedBond -= p.penalty;
        s.declined++;
        emit Declined(id, msg.sender);
        emit Refunded(id, p.buyer, p.amount, 0);
        _payout(p.buyer, p.amount);
    }

    /// @notice Accepts a delivery before the objection window ends.
    function release(uint256 id) external nonReentrant {
        Payment storage p = _payments[id];
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.status != Status.Delivered) revert WrongStatus();

        _release(id, p);
    }

    /// @notice Objects to a delivery during the objection window.
    /// @dev If the seller has no arbiter, the MVP rule applies at once: the buyer gets a refund
    /// plus the penalty. If the seller has an arbiter, the arbiter decides.
    function object(uint256 id) external nonReentrant {
        Payment storage p = _payments[id];
        if (msg.sender != p.buyer) revert NotBuyer();
        if (p.status != Status.Delivered) revert WrongStatus();
        if (block.timestamp > p.decideBy) revert TooLate();

        Seller storage s = _sellers[p.seller];
        s.objected++;
        emit Objected(id, msg.sender);

        address arbiter = s.arbiter;
        if (arbiter == address(0)) {
            _refund(id, p);
        } else {
            uint64 resolveBy = uint64(block.timestamp) + ARBITER_WINDOW;
            p.status = Status.Disputed;
            p.decideBy = resolveBy;
            emit Disputed(id, arbiter, resolveBy);
        }
    }

    /// @notice Decides an objection. Only the seller's arbiter can call this, and only until the
    /// arbiter deadline. After it, {settle} refunds the buyer plus the penalty.
    /// @param refundBuyer True to refund the buyer and pay the penalty. False to pay the seller.
    function resolve(uint256 id, bool refundBuyer) external nonReentrant {
        Payment storage p = _payments[id];
        if (msg.sender != _sellers[p.seller].arbiter) revert NotArbiter();
        if (p.status != Status.Disputed) revert WrongStatus();
        if (block.timestamp > p.decideBy) revert TooLate();

        emit Resolved(id, msg.sender, refundBuyer);
        if (refundBuyer) {
            _refund(id, p);
        } else {
            _release(id, p);
        }
    }

    /// @notice Settles a payment whose deadline has passed. Anyone can call this.
    /// @dev Pending after the delivery deadline: refund plus penalty.
    /// Delivered after the objection deadline: release to the seller.
    /// Disputed after the arbiter deadline: refund plus penalty, so an absent arbiter cannot
    /// freeze the funds.
    function settle(uint256 id) external nonReentrant {
        Payment storage p = _payments[id];
        Status status = p.status;
        if (status == Status.Pending) {
            if (block.timestamp <= p.deliverBy) revert TooEarly();
            _refund(id, p);
        } else if (status == Status.Delivered) {
            if (block.timestamp <= p.decideBy) revert TooEarly();
            _release(id, p);
        } else if (status == Status.Disputed) {
            if (block.timestamp <= p.decideBy) revert TooEarly();
            _refund(id, p);
        } else {
            revert WrongStatus();
        }
    }

    /// @notice Collects USDC that a failed transfer left behind.
    /// @dev USDC can block an address. A blocked recipient must not freeze settlement, so a failed
    /// payout becomes a claim and the payment still finishes.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        emit Claimed(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Returns a seller's terms, bond, and history.
    function sellerStats(address seller) external view returns (Seller memory) {
        return _sellers[seller];
    }

    /// @notice Returns the bond that no open payment has locked.
    function freeBond(address seller) external view returns (uint256) {
        Seller storage s = _sellers[seller];
        return s.bond - s.lockedBond;
    }

    /// @notice Returns delivered / (delivered + refunded) in basis points.
    /// @dev Returns 0 for a seller with no finished payments. Read {sellerStats} to tell a new
    /// seller from a bad seller. Declined payments do not count, because a third party can create
    /// them at will.
    function reliabilityBps(address seller) external view returns (uint256) {
        Seller storage s = _sellers[seller];
        uint256 finished = uint256(s.delivered) + s.refunded;
        return finished == 0 ? 0 : (uint256(s.delivered) * BPS) / finished;
    }

    /// @notice Returns a payment.
    function getPayment(uint256 id) external view returns (Payment memory) {
        return _payments[id];
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _release(uint256 id, Payment storage p) private {
        Seller storage s = _sellers[p.seller];
        p.status = Status.Released;
        s.lockedBond -= p.penalty;
        s.delivered++;
        emit Released(id, p.seller, p.amount);
        _payout(p.seller, p.amount);
    }

    function _refund(uint256 id, Payment storage p) private {
        Seller storage s = _sellers[p.seller];
        uint256 penalty = p.penalty;
        p.status = Status.Refunded;
        s.lockedBond -= penalty;
        s.bond -= penalty;
        s.refunded++;
        emit Refunded(id, p.buyer, p.amount, penalty);
        _payout(p.buyer, p.amount + penalty);
    }

    function _payout(address to, uint256 amount) private {
        if (!token.trySafeTransfer(to, amount)) {
            claimable[to] += amount;
            emit PayoutDeferred(to, amount);
        }
    }
}
