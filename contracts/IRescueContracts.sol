
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =========================================================
// ИНТЕРФЕЙС RESCUENFT
// =========================================================

interface IRescueNFT {
    function mintPassport(
        address to,
        uint256 requestId
    ) external returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС RESCUETREASURY
// =========================================================

interface IRescueTreasury {

    function setMilestonesContract(
        address _milestones
    ) external;

    // -----------------------------------------------------
    // ПОЖЕРТВОВАНИЯ
    // -----------------------------------------------------

    function donate(
        address donor
    ) external payable;

    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // -----------------------------------------------------
    // ДОСТУПНЫЕ СРЕДСТВА
    // -----------------------------------------------------

    function getAvailableBalance()
        external
        view
        returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function getContractBalance()
        external
        view
        returns (uint256);

    function getTotalSpentAllSources()
        external
        view
        returns (uint256);

    // -----------------------------------------------------
    // ПРОВЕРКА РЕЗЕРВИРОВАНИЯ
    // -----------------------------------------------------

    function requestReservationCreated(
        uint256 requestId
    ) external view returns (bool);

    // -----------------------------------------------------
    // РЕЗЕРВИРОВАНИЕ ОТДЕЛЬНОГО ЭТАПА
    // -----------------------------------------------------

    function reserveMilestoneFunds(
        uint256 requestId,
        uint256 milestoneId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // -----------------------------------------------------
    // ВЫПЛАТА ПО ЭТАПУ
    // -----------------------------------------------------

    function releaseMilestone(
        uint256 requestId,
        uint256 milestoneId,
        address payable recipient,
        uint256 amount,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    // -----------------------------------------------------
    // ОСВОБОЖДЕНИЕ ВСЕХ РЕЗЕРВОВ ЗАЯВКИ
    // -----------------------------------------------------

    function releaseReservation(
        uint256 requestId
    ) external returns (uint256 generalReleased);

    // -----------------------------------------------------
    // ПЕРЕРАСПРЕДЕЛЕНИЕ ЦЕЛЕВЫХ СРЕДСТВ
    // -----------------------------------------------------

    function reassignAvailableTargetFunds(
        uint256 requestId
    ) external returns (uint256 amount);

    // -----------------------------------------------------
    // ПОЖЕРТВОВАНИЯ НА ЗАЯВКУ
    // -----------------------------------------------------

    function requestDonations(
        uint256 requestId
    ) external view returns (uint256);

    function userRequestDonations(
        uint256 requestId,
        address user
    ) external view returns (uint256);

    // -----------------------------------------------------
    // ОБЩИЕ РЕЗЕРВЫ ЗАЯВКИ
    // -----------------------------------------------------

    function requestTargetReserved(
        uint256 requestId
    ) external view returns (uint256);

    function requestGeneralReserved(
        uint256 requestId
    ) external view returns (uint256);

    function requestTargetSpent(
        uint256 requestId
    ) external view returns (uint256);

    function requestTargetReassigned(
        uint256 requestId
    ) external view returns (uint256);

    // -----------------------------------------------------
    // РЕЗЕРВЫ ОТДЕЛЬНОГО ЭТАПА
    // -----------------------------------------------------

    function milestoneTargetReserved(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (uint256);

    function milestoneGeneralReserved(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (uint256);

    function milestoneReservationCreated(
        uint256 requestId,
        uint256 milestoneId
    ) external view returns (bool);

    // -----------------------------------------------------
    // ОБЩАЯ СТАТИСТИКА
    // -----------------------------------------------------

    function totalDonated()
        external
        view
        returns (uint256);

    function totalReserved()
        external
        view
        returns (uint256);

    function totalSpent()
        external
        view
        returns (uint256);

    function totalTargetDonations()
        external
        view
        returns (uint256);

    function totalTargetReserved()
        external
        view
        returns (uint256);

    function totalTargetSpent()
        external
        view
        returns (uint256);

    function totalTargetReassigned()
        external
        view
        returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС RESCUEDAOVIEW
// =========================================================

interface IRescueDAOView {

    // -----------------------------------------------------
    // ПРОВЕРКА ВАЛИДАТОРА
    // -----------------------------------------------------

    function isValidator(
        address account
    ) external view returns (bool);

    // -----------------------------------------------------
    // ОСНОВНЫЕ ДАННЫЕ ЗАЯВКИ
    // -----------------------------------------------------

    function getRequestCore(
        uint256 requestId
    )
        external
        view
        returns (
            address requester,
            uint256 requestedAmount,
            uint8 status,
            bool exists
        );

    // -----------------------------------------------------
    // СВОДКА ПО ЭТАПАМ
    // -----------------------------------------------------

    function getMilestoneSummary(
        uint256 requestId
    )
        external
        view
        returns (
            uint256 total,
            uint256 count
        );

    // -----------------------------------------------------
    // ОБРАТНЫЕ ВЫЗОВЫ ОТ RESCUEMILESTONES
    // -----------------------------------------------------

    function onMilestoneAdded(
        uint256 requestId,
        uint256 amount
    ) external;

    function onMilestoneUpdated(
        uint256 requestId,
        uint256 oldAmount,
        uint256 newAmount
    ) external;

    function onMilestoneReleased(
        uint256 requestId,
        uint256 amount
    ) external;

    function onValidatorApproved(
        address validator
    ) external;
}
