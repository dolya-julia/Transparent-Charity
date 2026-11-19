
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITreasury
 * @dev Интерфейс финансового хранилища RescueDAO.
 *
 * Используется основным контрактом RescueDAO
 * и контрактом RescueMilestones для взаимодействия
 * с финансовым хранилищем.
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
     * @param donor Адрес первоначального отправителя.
     */
    function donate(
        address donor
    ) external payable;

    /**
     * @dev Целевое пожертвование для конкретной заявки.
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

    // =========================================================
    // 4. РЕЗЕРВИРОВАНИЕ СРЕДСТВ
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
    // 5. ВЫПЛАТЫ ПО ЭТАПАМ ЛЕЧЕНИЯ
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
    // 6. ОСВОБОЖДЕНИЕ РЕЗЕРВОВ
    // =========================================================

    /**
     * @dev Освобождает неиспользованные резервы заявки.
     *
     * Вызывается RescueDAO при отмене заявки.
     *
     * @return generalReleased Освобождённая сумма общего фонда.
     */
    function releaseReservation(
        uint256 requestId
    )
        external
        returns (uint256 generalReleased);

    // =========================================================
    // 7. ПЕРЕРАСПРЕДЕЛЕНИЕ ЦЕЛЕВЫХ СРЕДСТВ
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

    // =========================================================
    // 8. ОБЩАЯ СТАТИСТИКА
    // =========================================================

    /**
     * @dev Возвращает общую сумму расходов
     * из целевых пожертвований и общего фонда.
     */
    function getTotalSpentAllSources()
        external
        view
        returns (uint256);
}
