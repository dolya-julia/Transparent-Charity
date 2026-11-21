// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITreasury
 * @dev Интерфейс финансового хранилища RescueDAO.
 *
 * Резервирование выполняется отдельно для каждого этапа.
 */
interface ITreasury {

    // =========================================================
    // НАСТРОЙКА
    // =========================================================

    function setMilestonesContract(
        address _milestones
    ) external;

    // =========================================================
    // ПОЖЕРТВОВАНИЯ
    // =========================================================

    function donate(
        address donor
    ) external payable;

    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // =========================================================
    // ДОСТУПНЫЕ СРЕДСТВА
    // =========================================================

    function getAvailableBalance()
        external
        view
        returns (uint256);

    function getContractBalance()
        external
        view
        returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function getTotalSpentAllSources()
        external
        view
        returns (uint256);

    // =========================================================
    // ПРОВЕРКА РЕЗЕРВИРОВАНИЯ
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
    // ПОЛУЧЕНИЕ РЕЗЕРВОВ ОТДЕЛЬНОГО ЭТАПА
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
    // РЕЗЕРВИРОВАНИЕ ОТДЕЛЬНОГО ЭТАПА
    // =========================================================

    function reserveMilestoneFunds(
        uint256 requestId,
        uint256 milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // =========================================================
    // ВЫПЛАТА ПО ЭТАПУ
    // =========================================================

    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // =========================================================
    // ОСВОБОЖДЕНИЕ РЕЗЕРВОВ
    // =========================================================

    function releaseReservation(
        uint256 requestId
    )
        external
        returns (uint256 generalReleased);

    // =========================================================
    // ПЕРЕРАСПРЕДЕЛЕНИЕ ЦЕЛЕВЫХ СРЕДСТВ
    // =========================================================

    function reassignAvailableTargetFunds(
        uint256 requestId
    )
        external
        returns (uint256 amount);
}
