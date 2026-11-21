
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRescueContracts.sol";

// =========================================================
// ОСНОВНОЙ КОНТРАКТ RESCUEMILESTONES
// =========================================================

contract RescueMilestones {

    // -----------------------------------------------------
    // АДРЕСА СВЯЗАННЫХ КОНТРАКТОВ
    // -----------------------------------------------------

    address public admin;
    address public daoContract;
    address public treasuryContract;

    // -----------------------------------------------------
    // СТАТУСЫ ЗАЯВОК
    // -----------------------------------------------------

    uint8 private constant STATUS_UNDER_REVIEW = 0;
    uint8 private constant STATUS_CHANGES_REQUESTED = 1;
    uint8 private constant STATUS_APPROVED = 2;

    // -----------------------------------------------------
    // СЧЁТЧИК СОЗДАННЫХ ЭТАПОВ
    // -----------------------------------------------------

    // Используется для защиты адресов связанных контрактов.
    uint256 public totalMilestonesCreated;

    // -----------------------------------------------------
    // СТРУКТУРА ЭТАПА
    // -----------------------------------------------------

    struct Milestone {

        string description;

        address payable recipient;

        uint256 amount;

        string evidenceURI;

        bytes32 evidenceHash;

        uint256 approvalCount;

        bool evidenceSubmitted;

        bool funded;

        bool released;

        bool exists;
    }

    // -----------------------------------------------------
    // ХРАНИЛИЩА
    // -----------------------------------------------------

    mapping(
        uint256 => mapping(uint256 => Milestone)
    ) private milestones;

    mapping(
        uint256 => uint256
    ) public milestoneCount;

    mapping(
        uint256 => uint256
    ) public milestoneTotal;

    mapping(
        uint256 => mapping(uint256 => mapping(address => bool))
    ) public hasApprovedMilestone;

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

    event MilestoneFunded(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
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

    event DAOUpdated(
        address indexed dao
    );

    event TreasuryUpdated(
        address indexed treasury
    );

    // =====================================================
    // МОДИФИКАТОРЫ
    // =====================================================

    modifier onlyAdmin() {

        require(
            msg.sender == admin,
            "Only admin"
        );

        _;
    }

    // =====================================================
    // КОНСТРУКТОР
    // =====================================================

    constructor(
        address _dao,
        address _treasury
    ) {

        require(
            _dao != address(0),
            "Invalid DAO"
        );

        require(
            _treasury != address(0),
            "Invalid Treasury"
        );

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

    /**
     * @notice Замена DAO.
     *
     * Разрешена только до создания первого этапа.
     */

    function setDAO(
        address _dao
    ) external onlyAdmin {

        require(
            totalMilestonesCreated == 0,
            "DAO is locked after milestone creation"
        );

        require(
            _dao != address(0),
            "Invalid DAO"
        );

        require(
            _dao.code.length > 0,
            "DAO is not a contract"
        );

        daoContract = _dao;

        emit DAOUpdated(_dao);
    }

    /**
     * @notice Замена Treasury.
     *
     * Вызвать функцию может администратор или DAO.
     */

    function setTreasury(
        address _treasury
    ) external {

        require(
            msg.sender == admin ||
            msg.sender == daoContract,
            "Only admin or DAO"
        );

        require(
            totalMilestonesCreated == 0,
            "Treasury is locked after milestone creation"
        );

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
     * @notice Проверяет, что этап добавляет или редактирует
     * именно заявитель и заявка ещё не опубликована.
     *
     * Допустимые статусы:
     * 0 — UnderReview
     * 1 — ChangesRequested
     */

    function _checkPreparationAccess(
        uint256 requestId
    )
        internal
        view
        returns (uint256 requestedAmount)
    {

        (
            address requester,
            uint256 amount,
            uint8 status,
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

    /**
     * @notice Добавляет новый этап заявки.
     *
     * Вызывается заявителем до одобрения заявки.
     */

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

        uint256 id =
            ++milestoneCount[requestId];

        Milestone storage m =
            milestones[requestId][id];

        m.description = description;

        m.recipient = recipient;

        m.amount = amount;

        m.exists = true;

        milestoneTotal[requestId] += amount;

        totalMilestonesCreated++;

        // Уведомляем DAO об изменении общей суммы этапов.
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

    /**
     * @notice Изменяет описание, получателя или сумму этапа.
     *
     * Изменение возможно только до одобрения заявки.
     */

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

        require(
            !m.funded,
            "Milestone already funded"
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

        m.evidenceURI = "";

        m.evidenceHash = bytes32(0);

        m.evidenceSubmitted = false;

        milestoneTotal[requestId] = newTotal;

        // Уведомляем DAO об изменении суммы этапа.
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
    // ФИНАНСИРОВАНИЕ ОТДЕЛЬНОГО ЭТАПА
    // =====================================================

    /**
     * @notice Резервирует средства для конкретного этапа.
     *
     * Может вызвать любой пользователь после одобрения заявки.
     *
     * Приоритет источников финансирования:
     *
     * 1. Целевые пожертвования заявки.
     * 2. Общий фонд для покрытия недостающей суммы.
     *
     * Если средств недостаточно, транзакция отменяется.
     */

    function fundMilestone(
        uint256 requestId,
        uint256 milestoneId
    ) external {

        (
            ,
            ,
            uint8 status,
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
            !m.funded,
            "Milestone already funded"
        );

        require(
            !m.released,
            "Milestone already released"
        );

        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        // -------------------------------------------------
        // 1. Получаем доступные целевые пожертвования.
        // -------------------------------------------------

        uint256 targetAvailable =
            treasury.getAvailableRequestDonations(
                requestId
            );

        // -------------------------------------------------
        // 2. Сначала используем целевые средства.
        // -------------------------------------------------

        uint256 targetAmount = m.amount;

        if (targetAmount > targetAvailable) {

            targetAmount = targetAvailable;
        }

        // -------------------------------------------------
        // 3. Недостающая сумма берётся из общего фонда.
        // -------------------------------------------------

        uint256 generalAmount =
            m.amount - targetAmount;

        require(
            treasury.getAvailableBalance() >= generalAmount,
            "Insufficient funds for milestone"
        );

        // -------------------------------------------------
        // 4. Резервируем средства в Treasury.
        // -------------------------------------------------

        treasury.reserveMilestoneFunds(
            requestId,
            milestoneId,
            targetAmount,
            generalAmount
        );

        // -------------------------------------------------
        // 5. Отмечаем этап как профинансированный.
        // -------------------------------------------------

        m.funded = true;

        emit MilestoneFunded(
            requestId,
            milestoneId,
            m.amount,
            targetAmount,
            generalAmount
        );
    }

    // =====================================================
    // ЗАГРУЗКА ДОКАЗАТЕЛЬСТВ ВЫПОЛНЕНИЯ
    // =====================================================

    /**
     * @notice Заявитель прикрепляет доказательства выполнения.
     *
     * Например:
     * - чек;
     * - счёт;
     * - акт выполненных работ;
     * - фотографии;
     * - документы ветеринарной клиники.
     *
     * Доказательства должны быть представлены до одобрения
     * этапа валидаторами.
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
            m.funded,
            "Milestone is not funded"
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
     * @notice Валидатор подтверждает выполнение этапа.
     *
     * Для выплаты необходимо минимум два подтверждения.
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
            m.funded,
            "Milestone is not funded"
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

        // Фиксируем одобрение конкретного валидатора.
        hasApprovedMilestone[
            requestId
        ][
            milestoneId
        ][
            msg.sender
        ] = true;

        m.approvalCount++;

        // Уведомляем DAO для обновления статистики валидаторов.
        IRescueDAOView(daoContract).onValidatorApproved(
            msg.sender
        );

        emit MilestoneApproved(
            requestId,
            milestoneId,
            msg.sender,
            m.approvalCount
        );

        // После двух подтверждений выполняем выплату.
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

    /**
     * @notice Внутренняя функция выплаты.
     *
     * Проверяет резервы и переводит средства получателю.
     */

    function _releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        Milestone storage m
    ) internal {

        require(
            m.funded,
            "Milestone is not funded"
        );

        require(
            !m.released,
            "Milestone already released"
        );

        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        // Получаем целевой резерв этапа.
        uint256 targetAmount =
            treasury.milestoneTargetReserved(
                requestId,
                milestoneId
            );

        // Получаем резерв из общего фонда.
        uint256 generalAmount =
            treasury.milestoneGeneralReserved(
                requestId,
                milestoneId
            );

        require(
            targetAmount + generalAmount == m.amount,
            "Invalid milestone reservation"
        );

        // Блокируем повторную выплату.
        // При ошибке внешнего вызова транзакция полностью откатится.
        m.released = true;

        // Выплачиваем средства получателю.
        treasury.releaseMilestone(
            requestId,
            milestoneId,
            m.recipient,
            m.amount,
            targetAmount,
            generalAmount
        );

        // Уведомляем DAO о завершении этапа.
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

    /**
     * @notice Возвращает подробную информацию об этапе.
     *
     * milestoneId начинается с 1.
     */

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
    // ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ ОБ ЭТАПЕ
    // =====================================================

    /**
     * @notice Возвращает состояние финансирования этапа.
     *
     * funded          — средства зарезервированы;
     * targetReserved  — резерв из целевых пожертвований;
     * generalReserved — резерв из общего фонда;
     * released        — средства выплачены.
     */

    function getMilestoneFundingStatus(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (
            bool funded,
            uint256 targetReserved,
            uint256 generalReserved,
            bool released
        )
    {

        Milestone storage m =
            milestones[requestId][milestoneId];

        require(
            m.exists,
            "Milestone does not exist"
        );

        IRescueTreasury treasury =
            IRescueTreasury(treasuryContract);

        return (
            m.funded,

            treasury.milestoneTargetReserved(
                requestId,
                milestoneId
            ),

            treasury.milestoneGeneralReserved(
                requestId,
                milestoneId
            ),

            m.released
        );
    }

    // =====================================================
    // СВОДНАЯ ИНФОРМАЦИЯ ОБ ЭТАПАХ
    // =====================================================

    /**
     * @notice Возвращает общую сумму и количество этапов.
     */

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

    /**
     * @notice Проверяет, одобрил ли конкретный валидатор этап.
     */

    function hasValidatorApproved(
        uint256 requestId,
        uint256 milestoneId,
        address validator
    )
        external
        view
        returns (bool)
    {

        return hasApprovedMilestone[
            requestId
        ][
            milestoneId
        ][
            validator
        ];
    }
}
