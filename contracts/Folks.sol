// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721A} from "erc721a/contracts/ERC721A.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Folks
/// @notice 10,000 characters for 10,000 folks.
/// @dev Phases run team -> folklist -> public. The owner sets when folklist
///      opens; public opens a fixed hour later. Prices and times are stored
///      on-chain so the site cannot be bypassed by calling this directly.
contract Folks is ERC721A, Ownable, ReentrancyGuard {
    // ---------------------------------------------------------------- errors

    error SaleClosed();
    error WrongPayment();
    error SoldOut();
    error NotOnFolklist();
    error TeamMintDone();
    error BadInput();
    error WithdrawFailed();
    error TransfersLocked();

    // ---------------------------------------------------------------- config

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant TEAM_RESERVE = 150;

    /// @dev Public opens this long after folklist. One hour, per the drop plan.
    uint256 public constant PUBLIC_DELAY = 1 hours;

    /// @notice When folklist minting opens. Zero means the sale has not been
    ///         scheduled yet, which keeps minting shut until the owner sets it.
    uint256 public folklistStart;

    uint256 public folklistPrice;
    uint256 public publicPrice;

    /// @notice Charged on top of the price for every mint, including free ones.
    uint256 public platformFee;

    /// @notice Where platform fees are sent. Fees are forwarded per mint so
    ///         they never mix with sale proceeds held for withdraw().
    address public feeRecipient;

    /// @notice Merkle root of the folklist. Leaves are keccak256(address).
    bytes32 public folklistRoot;

    uint256 public teamMinted;

    /// @notice While true, Folks cannot change hands. Minting still works, so
    ///         the sale runs normally; only secondary trading is held back.
    ///         One-way: once opened, trading cannot be locked again.
    bool public transfersLocked = true;

    string private _base;

    // ---------------------------------------------------------------- events

    event SaleScheduled(uint256 folklistStart, uint256 publicStart);
    event PricesUpdated(uint256 folklistPrice, uint256 publicPrice);
    event PlatformFeeUpdated(uint256 fee, address recipient);
    event FolklistRootUpdated(bytes32 root);
    event BaseURIUpdated(string baseURI);
    event TransfersOpened();

    // ----------------------------------------------------------- constructor

    constructor(
        address owner_,
        uint256 folklistPrice_,
        uint256 publicPrice_,
        uint256 platformFee_,
        address feeRecipient_,
        string memory baseURI_
    ) ERC721A("Folks", "FOLKS") Ownable(owner_) {
        if (feeRecipient_ == address(0) && platformFee_ != 0) revert BadInput();
        folklistPrice = folklistPrice_;
        publicPrice = publicPrice_;
        platformFee = platformFee_;
        feeRecipient = feeRecipient_;
        _base = baseURI_;
        emit PricesUpdated(folklistPrice_, publicPrice_);
        emit PlatformFeeUpdated(platformFee_, feeRecipient_);
    }

    // ---------------------------------------------------------------- phases

    /// @notice 0 = not started, 1 = folklist, 2 = public.
    function phase() public view returns (uint8) {
        uint256 start = folklistStart;
        if (start == 0 || block.timestamp < start) return 0;
        if (block.timestamp < start + PUBLIC_DELAY) return 1;
        return 2;
    }

    function publicStart() public view returns (uint256) {
        uint256 start = folklistStart;
        return start == 0 ? 0 : start + PUBLIC_DELAY;
    }

    /// @notice Total a wallet must send for `quantity` in the current phase,
    ///         price plus platform fee. The site quotes this so the number in
    ///         the wallet prompt matches the number on the page.
    function mintCost(uint256 quantity) external view returns (uint256) {
        uint8 p = phase();
        uint256 unit = p == 1 ? folklistPrice : publicPrice;
        return (unit + platformFee) * quantity;
    }

    // ----------------------------------------------------------------- mint

    /// @notice Mint during the folklist hour. Requires a proof for `msg.sender`.
    /// @dev No per-wallet limit by design; the only ceiling is MAX_SUPPLY.
    function folklistMint(uint256 quantity, bytes32[] calldata proof)
        external
        payable
        nonReentrant
    {
        if (quantity == 0) revert BadInput();
        if (phase() != 1) revert SaleClosed();
        if (_totalMinted() + quantity > MAX_SUPPLY) revert SoldOut();
        uint256 fee = platformFee * quantity;
        if (msg.value != folklistPrice * quantity + fee) revert WrongPayment();

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        if (!MerkleProof.verifyCalldata(proof, folklistRoot, leaf)) {
            revert NotOnFolklist();
        }

        _mint(msg.sender, quantity);
        _forwardFee(fee);
    }

    /// @notice Mint once public opens. Unminted folklist supply rolls in here
    ///         automatically, since both draw from the same MAX_SUPPLY.
    function publicMint(uint256 quantity) external payable nonReentrant {
        if (quantity == 0) revert BadInput();
        if (phase() != 2) revert SaleClosed();
        if (_totalMinted() + quantity > MAX_SUPPLY) revert SoldOut();
        uint256 fee = platformFee * quantity;
        if (msg.value != publicPrice * quantity + fee) revert WrongPayment();

        _mint(msg.sender, quantity);
        _forwardFee(fee);
    }

    /// @dev Sent per mint rather than pooled, so withdraw() only ever moves
    ///      money that belongs to the project.
    function _forwardFee(uint256 fee) private {
        if (fee == 0) return;
        (bool ok, ) = payable(feeRecipient).call{value: fee}("");
        if (!ok) revert WithdrawFailed();
    }

    /// @notice Team allocation, mintable by the owner before or during the sale.
    function teamMint(address to, uint256 quantity) external onlyOwner {
        if (quantity == 0 || to == address(0)) revert BadInput();
        if (teamMinted + quantity > TEAM_RESERVE) revert TeamMintDone();
        if (_totalMinted() + quantity > MAX_SUPPLY) revert SoldOut();

        teamMinted += quantity;
        _mint(to, quantity);
    }

    // ----------------------------------------------------------------- admin

    /// @notice Schedule (or reschedule) the sale. Public follows an hour later.
    function setFolklistStart(uint256 timestamp) external onlyOwner {
        folklistStart = timestamp;
        emit SaleScheduled(timestamp, timestamp == 0 ? 0 : timestamp + PUBLIC_DELAY);
    }

    function setPrices(uint256 folklistPrice_, uint256 publicPrice_)
        external
        onlyOwner
    {
        folklistPrice = folklistPrice_;
        publicPrice = publicPrice_;
        emit PricesUpdated(folklistPrice_, publicPrice_);
    }

    function setPlatformFee(uint256 fee, address recipient) external onlyOwner {
        if (recipient == address(0) && fee != 0) revert BadInput();
        platformFee = fee;
        feeRecipient = recipient;
        emit PlatformFeeUpdated(fee, recipient);
    }

    function setFolklistRoot(bytes32 root) external onlyOwner {
        folklistRoot = root;
        emit FolklistRootUpdated(root);
    }

    /// @notice Open secondary trading. Deliberately one-way: holders should
    ///         never have to worry about their Folks being frozen again.
    function openTransfers() external onlyOwner {
        transfersLocked = false;
        emit TransfersOpened();
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _base = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function withdraw(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadInput();
        (bool ok, ) = payable(to).call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    // ------------------------------------------------------------- overrides

    function totalMinted() external view returns (uint256) {
        return _totalMinted();
    }

    /// @dev Blocks wallet-to-wallet moves while locked. `from == address(0)`
    ///      is a mint and `to == address(0)` is a burn, both of which stay
    ///      allowed so the sale itself is unaffected.
    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        if (transfersLocked && from != address(0) && to != address(0)) {
            revert TransfersLocked();
        }
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function _startTokenId() internal pure override returns (uint256) {
        return 1;
    }
}
