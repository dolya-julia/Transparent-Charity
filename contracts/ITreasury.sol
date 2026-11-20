
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITreasury
 * @dev Интерфейс финансового хранилища RescueDAO.
 *
 * Используется основным контрактом RescueDAO
 * и контрактом RescueMilestones для взаимодействия
 * с финансовым хранилищем.
 *
 * Treasury отвечает за:
 * - приём пожертвований;
 * - учёт целевых и общих средств;
 * - резервирование средств;
 * - выплаты по этапам;
 * - освобождение резервов;
 * - перераспределение целевых средств.
 *
 * Управление статусами заявок выполняет RescueDAO.
 */
interface ITreasury {

    // =========================================================
    // 1. НАСТРОЙКА КОНТРАКТА ЭТАПОВ
    // =========================================================

    /**
     * @dev Устанавливает адрес контракта RescueMilestones.
     *
     * Вызывается основным контрактом RescueDAO.
     */
    function setMilestonesContract(
        address _milestones
    ) external;

    // =========================================================
    // 2. ПОЖЕРТВОВАНИЯ
    // =========================================================

    /**
     * @dev Пожертвование в общий фонд.
     *
     * @param donor Адрес первоначального отправителя.
     */
    function donate(
        address donor
    ) external payable;

    /**
     * @dev Целевое пожертвование для конкретной заявки.
     *
     * @param requestId Идентификатор заявки.
     * @param donor Адрес первоначального отправителя.
     */
    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // =========================================================
    // 3. ДОСТУПНЫЕ СРЕДСТВА
    // =========================================================

    /**
     * @dev Возвращает доступный остаток общего фонда.
     */
    function getAvailableBalance()
        external
        view
        returns (uint256);

    /**
     * @dev Возвращает фактический баланс ETH Treasury.
     */
    function getContractBalance()
        external
        view
        returns (uint256);

    /**
     * @dev Возвращает доступные целевые пожертвования заявки.
     */
    function getAvailableRequestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    /**
     * @dev Возвращает общую сумму расходов
     * из целевых пожертвований и общего фонда.
     */
    function getTotalSpentAllSources()
        external
        view
        returns (uint256);

    // =========================================================
    // 4. ПРОВЕРКА РЕЗЕРВИРОВАНИЯ
    // =========================================================

    /**
     * @dev Проверяет, создавалось ли резервирование
     * средств для конкретной заявки.
     */
    function requestReservationCreated(
        uint256 requestId
    )
        external
        view
        returns (bool);

    // =========================================================
    // 5. РЕЗЕРВИРОВАНИЕ СРЕДСТВ
    // =========================================================

    /**
     * @dev Резервирует средства для одобренной заявки.
     *
     * @param requestId Идентификатор заявки.
     * @param targetAmount Сумма из целевых пожертвований.
     * @param generalAmount Сумма из общего фонда.
     */
    function reserveFunds(
        uint256 requestId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // =========================================================
    // 6. ВЫПЛАТЫ ПО ЭТАПАМ ЛЕЧЕНИЯ
    // =========================================================

    /**
     * @dev Выплачивает средства получателю после подтверждения этапа.
     *
     * Вызывается контрактом RescueMilestones.
     *
     * @param requestId Идентификатор заявки.
     * @param milestoneId Идентификатор этапа.
     * @param recipient Получатель средств.
     * @param amount Полная сумма выплаты.
     * @param targetAmount Часть из целевых пожертвований.
     * @param generalAmount Часть из общего фонда.
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
    // 7. ОСВОБОЖДЕНИЕ РЕЗЕРВОВ
    // =========================================================

    /**
     * @dev Освобождает неиспользованные резервы заявки.
     *
     * Вызывается RescueDAO при отмене одобренной заявки.
     *
     * @return generalReleased Освобождённая сумма общего фонда.
     */
    function releaseReservation(
        uint256 requestId
    )
        external
        returns (uint256 generalReleased);

    // =========================================================
    // 8. ПЕРЕРАСПРЕДЕЛЕНИЕ ЦЕЛЕВЫХ СРЕДСТВ
    // =========================================================

    /**
     * @dev Переводит доступные целевые пожертвования
     * заявки в общий фонд.
     *
     * @return amount Переведённая сумма.
     */
    function reassignAvailableTargetFunds(
        uint256 requestId
    )
        external
        returns (uint256 amount);

}
