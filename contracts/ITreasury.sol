
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITreasury
 * @dev Интерфейс финансового хранилища RescueDAO.
 *
 * Поддерживает два источника финансирования:
 * 1. Общий фонд.
 * 2. Адресные пожертвования на конкретные заявки.
 *
 * Средства резервируются отдельно для каждого этапа.
 * Выплата производится после подтверждения этапа.
 */
interface ITreasury {

    // =========================================================
    // 1. НАСТРОЙКА
    // =========================================================

    function setMilestonesContract(
        address _milestones
    ) external;


    // =========================================================
    // 2. ПОЖЕРТВОВАНИЯ
    // =========================================================

    /**
     * Пожертвование в общий фонд.
     */
    function donate(
        address donor
    ) external payable;

    /**
     * Адресное пожертвование на конкретную заявку.
     */
    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;


    // =========================================================
    // 3. ОБЩИЕ БАЛАНСЫ
    // =========================================================

    function getAvailableBalance()
        external
        view
        returns (uint256);

    function getContractBalance()
        external
        view
        returns (uint256);

    function getTotalSpentAllSources()
        external
        view
        returns (uint256);


    // =========================================================
    // 4. БАЛАНСЫ КОНКРЕТНОЙ ЗАЯВКИ
    // =========================================================

    /**
     * Все адресные пожертвования, поступившие на заявку.
     */
    function requestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Доступные адресные средства заявки.
     *
     * Учитывает уже зарезервированные,
     * потраченные и переведённые в общий фонд средства.
     */
    function getAvailableRequestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Целевые средства, зарезервированные по заявке.
     */
    function requestTargetReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Общие средства, зарезервированные по заявке.
     */
    function requestGeneralReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Целевые средства, уже потраченные по заявке.
     */
    function requestTargetSpent(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Целевые средства, переведённые из заявки
     * в общий фонд.
     */
    function requestTargetReassigned(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * Размер пожертвования конкретного пользователя
     * на конкретную заявку.
     */
    function userRequestDonations(
        uint256 requestId,
        address donor
    )
        external
        view
        returns (uint256);


    // =========================================================
    // 5. ПРОВЕРКА РЕЗЕРВИРОВАНИЯ
    // =========================================================

    function requestReservationCreated(
        uint256 requestId
    )
        external
        view
        returns (bool);

    function milestoneReservationCreated(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (bool);


    // =========================================================
    // 6. РЕЗЕРВЫ ОТДЕЛЬНОГО ЭТАПА
    // =========================================================

    function milestoneTargetReserved(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (uint256);

    function milestoneGeneralReserved(
        uint256 requestId,
        uint256 milestoneId
    )
        external
        view
        returns (uint256);


    // =========================================================
    // 7. РЕЗЕРВИРОВАНИЕ ОТДЕЛЬНОГО ЭТАПА
    // =========================================================

    /**
     * Резервирует средства конкретного этапа.
     *
     * targetAmount — сумма из адресных пожертвований.
     * generalAmount — сумма из общего фонда.
     */
    function reserveMilestoneFunds(
        uint256 requestId,
        uint256 milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;


    // =========================================================
    // 8. ВЫПЛАТА ПО ЭТАПУ
    // =========================================================

    /**
     * Перечисляет зарезервированные средства получателю.
     *
     * Вызывается RescueMilestones после необходимого
     * количества подтверждений валидаторов.
     */
    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;


    // =========================================================
    // 9. ОСВОБОЖДЕНИЕ РЕЗЕРВОВ ЗАЯВКИ
    // =========================================================

    /**
     * Освобождает все неиспользованные резервы этапов.
     *
     * Возвращает сумму освобождённых средств общего фонда.
     * Освобождённые целевые резервы DAO получает отдельно
     * через requestTargetReserved() до вызова этой функции.
     */
    function releaseReservation(
        uint256 requestId
    )
        external
        returns (uint256 generalReleased);


    // =========================================================
    // 10. ПЕРЕРАСПРЕДЕЛЕНИЕ ЦЕЛЕВЫХ СРЕДСТВ
    // =========================================================

    /**
     * Переводит доступные адресные пожертвования
     * в общий фонд.
     *
     * Уже потраченные и зарезервированные средства
     * не затрагиваются.
     */
    function reassignAvailableTargetFunds(
        uint256 requestId
    )
        external
        returns (uint256 amount);
}
