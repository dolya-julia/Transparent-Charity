
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRescueContracts.sol";

// =========================================================
// ОСНОВНОЙ КОНТРАКТ RESCUEMILESTONES
// =========================================================

contract RescueMilestones {

    address public admin;
    address public daoContract;
    address public treasuryContract;

    // Статусы RescueDAO:
    // 0 — UnderReview
    // 1 — ChangesRequested
    // 2 — Voting
    // 3 — Approved
    // 4 — Rejected
    // 5 — Completed
    // 6 — Cancelled

    uint8 private constant STATUS_UNDER_REVIEW = 0;
    uint8 private constant STATUS_CHANGES_REQUESTED = 1;
    uint8 private constant STATUS_APPROVED = 3;

    struct Milestone {
        string description;
        address payable recipient;
        uint256 amount;

        string evidenceURI;
        bytes32 evidenceHash;

        uint256 approvalCount;

        bool evidenceSubmitted;
        bool released;
        bool exists;
    }

    // requestId => milestoneId => Milestone
    mapping(uint256 => mapping(uint256 => Milestone))
        private milestones;

    // Количество этапов заявки.
    mapping(uint256 => uint256)
        public milestoneCount;

    // Общая сумма этапов заявки.
    mapping(uint256 => uint256)
        public milestoneTotal;

    // requestId => milestoneId => validator => approved
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))
        public hasApprovedMilestone;

    // =====================================================
    // СОБЫТИЯ
    // =====================================================

    event MilestoneCreated(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        string description,
        address recipient,
        uint256 amount
    );

    event MilestoneUpdated(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        string description,
        address recipient,
        uint256 oldAmount,
        uint256 newAmount
    );

    event MilestoneEvidenceSubmitted(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        string evidenceURI,
        bytes32 evidenceHash
    );

    event MilestoneApproved(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address indexed validator,
        uint256 approvalCount
    );

    event MilestoneFundsReleased(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        address recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    );

    event DAOUpdated(address indexed dao);
    event TreasuryUpdated(address indexed treasury);

    // =====================================================
    // МОДИФИКАТОРЫ
    // =====================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // =====================================================
    // КОНСТРУКТОР
    // =====================================================

    constructor(
        address _dao,
        address _treasury
    ) {
        require(_dao != address(0), "Invalid DAO");
        require(_treasury != address(0), "Invalid Treasury");

        require(
            _dao.code.length > 0,
            "DAO is not a contract"
        );

        require(
            _treasury.code.length > 0,
            "Treasury is not a contract"
        );

        admin = msg.sender;
        daoContract = _dao;
        treasuryContract = _treasury;
    }

    // =====================================================
    // НАСТРОЙКА КОНТРАКТОВ
    // =====================================================

    function setDAO(
        address _dao
    ) external onlyAdmin {
        require(_dao != address(0), "Invalid DAO");

        require(
            _dao.code.length > 0,
            "DAO is not a contract"
        );

        daoContract = _dao;

        emit DAOUpdated(_dao);
    }

    function setTreasury(
        address _treasury
    ) external onlyAdmin {
        require(
            _treasury != address(0),
            "Invalid Treasury"
        );

        require(
            _treasury.code.length > 0,
            "Treasury is not a contract"
        );

        treasuryContract = _treasury;

        emit TreasuryUpdated(_treasury);
    }

    // =====================================================
    // ПРОВЕРКА ПРАВ НА ПОДГОТОВКУ ЗАЯВКИ
    // =====================================================

    /**
     * Этапы можно создавать и редактировать:
     * - пока заявка находится на проверке;
     * - после возврата заявки на доработку.
     *
     * После публикации заявки редактирование запрещено.
     */
    function _checkPreparationAccess(
        uint256 requestId
    ) internal view returns (
        uint256 requestedAmount
    ) {
        (
            address requester,
            uint256 amount,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAOView(daoContract)
            .getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        require(
            msg.sender == requester,
            "Only requester"
        );

        require(
            status == STATUS_UNDER_REVIEW ||
            status == STATUS_CHANGES_REQUESTED,
            "Request is not editable"
        );

        return amount;
    }

    // =====================================================
    // ДОБАВЛЕНИЕ ЭТАПА
    // =====================================================

    function addMilestone(
        uint256 requestId,
        string calldata description,
        address payable recipient,
        uint256 amount
    ) external {
        uint256 requestedAmount =
            _checkPreparationAccess(requestId);

        require(
            bytes(description).length > 0,
            "Empty description"
        );

        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            amount > 0,
            "Invalid amount"
        );

        require(
            milestoneTotal[requestId] + amount <= requestedAmount,
            "Milestone total exceeds request"
        );

        uint256 id = ++milestoneCount[requestId];

        Milestone storage m = milestones[requestId][id];

        m.description = description;
        m.recipient = recipient;
        m.amount = amount;
        m.exists = true;

        milestoneTotal[requestId] += amount;

        // Синхронизация суммы и количества этапов с DAO.
        IRescueDAOView(daoContract).onMilestoneAdded(
            requestId,
            amount
        );

        emit MilestoneCreated(
            requestId,
            id,
            description,
            recipient,
            amount
        );
    }

    // =====================================================
    // РЕДАКТИРОВАНИЕ ЭТАПА
    // =====================================================

    function updateMilestone(
        uint256 requestId,
        uint256 milestoneId,
        string calldata description,
        address payable recipient,
        uint256 newAmount
    ) external {
        uint256 requestedAmount =
            _checkPreparationAccess(requestId);

        require(
            bytes(description).length > 0,
            "Empty description"
        );

        require(
            recipient != address(0),
            "Invalid recipient"
        );

        require(
            newAmount > 0,
            "Invalid amount"
        );

        Milestone storage m =
            milestones[requestId][milestoneId];

        require(
            m.exists,
            "Milestone does not exist"
        );

        require(
            !m.released,
            "Milestone already released"
        );

        uint256 oldAmount = m.amount;

        uint256 newTotal =
            milestoneTotal[requestId] -
            oldAmount +
            newAmount;

        require(
            newTotal <= requestedAmount,
            "Milestone total exceeds request"
        );

        m.description = description;
        m.recipient = recipient;
        m.amount = newAmount;

        // При изменении этапа ранее загруженное
        // подтверждение считается неактуальным.
        m.evidenceURI = "";
        m.evidenceHash = bytes32(0);
        m.evidenceSubmitted = false;

        milestoneTotal[requestId] = newTotal;

        // Синхронизация суммы этапов с DAO.
        IRescueDAOView(daoContract).onMilestoneUpdated(
            requestId,
            oldAmount,
            newAmount
        );

        emit MilestoneUpdated(
            requestId,
            milestoneId,
            description,
            recipient,
            oldAmount,
            newAmount
        );
    }

    // =====================================================
    // ЗАГРУЗКА ДОКАЗАТЕЛЬСТВ ВЫПОЛНЕНИЯ
    // =====================================================

    /**
     * Инициатор прикладывает документы,
     * подтверждающие выполнение этапа.
     *
     * Доступно после одобрения заявки.
     * До первого одобрения валидатором доказательства
     * можно обновлять.
     */
    function submitMilestoneEvidence(
        uint256 requestId,
        uint256 milestoneId,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external {
        (
            address requester,
            ,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAOView(daoContract)
            .getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        require(
            status == STATUS_APPROVED,
            "Request is not approved"
        );

        require(
            msg.sender == requester,
            "Only requester"
        );

        Milestone storage m =
            milestones[requestId][milestoneId];

        require(
            m.exists,
            "Milestone does not exist"
        );

        require(
            !m.released,
            "Already released"
        );

        require(
            m.approvalCount == 0,
            "Evidence is locked"
        );

        require(
            bytes(evidenceURI).length > 0,
            "Empty evidence URI"
        );

        require(
            evidenceHash != bytes32(0),
            "Invalid evidence hash"
        );

        m.evidenceURI = evidenceURI;
        m.evidenceHash = evidenceHash;
        m.evidenceSubmitted = true;

        emit MilestoneEvidenceSubmitted(
            requestId,
            milestoneId,
            evidenceURI,
            evidenceHash
        );
    }

    // =====================================================
    // ПОДТВЕРЖДЕНИЕ ЭТАПА ВАЛИДАТОРАМИ
    // =====================================================

    /**
     * Для перечисления средств требуются два разных
     * валидатора.
     */
    function approveMilestone(
        uint256 requestId,
        uint256 milestoneId
    ) external {
        require(
            IRescueDAOView(daoContract).isValidator(msg.sender),
            "Only validator"
        );

        (
            ,
            ,
            uint8 status,
            ,
            bool exists
        ) = IRescueDAOView(daoContract)
            .getRequestCore(requestId);

        require(
            exists,
            "Request does not exist"
        );

        require(
            status == STATUS_APPROVED,
            "Request is not approved"
        );

        Milestone storage m =
            milestones[requestId][milestoneId];

        require(
            m.exists,
            "Milestone does not exist"
        );

        require(
            m.evidenceSubmitted,
            "Evidence not submitted"
        );

        require(
            !m.released,
            "Already released"
        );

        require(
            !hasApprovedMilestone[requestId][milestoneId][msg.sender],
            "Already approved"
        );

        hasApprovedMilestone[requestId][milestoneId][msg.sender] = true;

        m.approvalCount++;

        IRescueDAOView(daoContract).onValidatorApproved(
            msg.sender
        );

        emit MilestoneApproved(
            requestId,
            milestoneId,
            msg.sender,
            m.approvalCount
        );

        if (m.approvalCount >= 2) {
            _releaseMilestone(
                requestId,
                milestoneId,
                m
            );
        }
    }

    // =====================================================
    // ВЫПУСК СРЕДСТВ ПО ЭТАПУ
    // =====================================================

    function _releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        Milestone storage m
    ) internal {
        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        uint256 targetReserved =
            treasury.requestTargetReserved(requestId);

        // Сначала используются зарезервированные
        // целевые пожертвования.
        uint256 targetAmount = m.amount;

        if (targetAmount > targetReserved) {
            targetAmount = targetReserved;
        }

        // Недостающая часть выплачивается из общего фонда.
        uint256 generalAmount =
            m.amount - targetAmount;

        require(
            treasury.requestGeneralReserved(requestId) >= generalAmount,
            "Insufficient general reserve"
        );

        treasury.releaseMilestone(
            requestId,
            milestoneId,
            m.recipient,
            m.amount,
            targetAmount,
            generalAmount
        );

        m.released = true;

        // Обновление прогресса заявки в DAO.
        IRescueDAOView(daoContract).onMilestoneReleased(
            requestId,
            m.amount
        );

        emit MilestoneFundsReleased(
            requestId,
            milestoneId,
            m.recipient,
            m.amount,
            targetAmount,
            generalAmount
        );
    }

    // =====================================================
    // ПОЛУЧЕНИЕ ИНФОРМАЦИИ ОБ ЭТАПЕ
    // =====================================================

    function getMilestone(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            string memory description,
            address recipient,
            uint256 amount,
            string memory evidenceURI,
            bytes32 evidenceHash,
            uint256 approvalCount,
            bool evidenceSubmitted,
            bool released
        )
    {
        Milestone storage m =
            milestones[requestId][milestoneId];

        require(
            m.exists,
            "Milestone does not exist"
        );

        return (
            m.description,
            m.recipient,
            m.amount,
            m.evidenceURI,
            m.evidenceHash,
            m.approvalCount,
            m.evidenceSubmitted,
            m.released
        );
    }

    // =====================================================
    // СВОДНАЯ ИНФОРМАЦИЯ ОБ ЭТАПАХ
    // =====================================================

    function getMilestoneSummary(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 total,
            uint256 count
        )
    {
        return (
            milestoneTotal[requestId],
            milestoneCount[requestId]
        );
    }

    // =====================================================
    // ПРОВЕРКА ОДОБРЕНИЯ ВАЛИДАТОРОМ
    // =====================================================

    function hasValidatorApproved(
        uint256 requestId,
        uint256 milestoneId,
        address validator
    ) external view returns (bool) {
        return hasApprovedMilestone[requestId][milestoneId][validator];
    }
}
