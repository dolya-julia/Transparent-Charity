
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// =========================================================
// ИНТЕРФЕЙС RESCUENFT
// =========================================================

interface IRescueNFT {

    function mintPassport(
        address to,
        uint256 requestId
    )
        external
        returns (uint256);
}

// =========================================================
// ИНТЕРФЕЙС RESCUETREASURY
// =========================================================

interface IRescueTreasury {

    // -----------------------------------------------------
    // Настройка
    // -----------------------------------------------------

    function setMilestonesContract(
        address _milestones
    ) external;

    // -----------------------------------------------------
    // Пожертвования
    // -----------------------------------------------------

    function donate(
        address donor
    ) external payable;

    function donateToRequest(
        uint256 requestId,
        address donor
    ) external payable;

    // -----------------------------------------------------
    // Доступные средства
    // -----------------------------------------------------

    function getAvailableBalance()
        external
        view
        returns (uint256);

    function getAvailableRequestDonations(
        uint256 requestId
    )
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

    // -----------------------------------------------------
    // Проверка резервирования
    // -----------------------------------------------------

    function requestReservationCreated(
        uint256 requestId
    )
        external
        view
        returns (bool);

    // -----------------------------------------------------
    // Резервирование средств
    // -----------------------------------------------------

    function reserveFunds(
        uint256 requestId,
        uint256 targetAmount,
        uint256 generalAmount
    ) external;

    function releaseReservation(
        uint256 requestId
    )
        external
        returns (uint256 generalReleased);

    function reassignAvailableTargetFunds(
        uint256 requestId
    )
        external
        returns (uint256 amount);

    // -----------------------------------------------------
    // Выплата средств по этапу
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
    // Данные о пожертвованиях по заявкам
    // -----------------------------------------------------

    function requestDonations(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function userRequestDonations(
        uint256 requestId,
        address user
    )
        external
        view
        returns (uint256);

    // -----------------------------------------------------
    // Резервы и расходы по заявкам
    // -----------------------------------------------------

    function requestTargetReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestGeneralReserved(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestTargetSpent(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    function requestTargetReassigned(
        uint256 requestId
    )
        external
        view
        returns (uint256);

    // -----------------------------------------------------
    // Общая финансовая статистика
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
    // Проверка роли валидатора
    // -----------------------------------------------------

    function isValidator(
        address account
    )
        external
        view
        returns (bool);

    // -----------------------------------------------------
    // Основные данные заявки
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
            uint256 votingEndsAt,
            bool exists
        );

    // -----------------------------------------------------
    // Сводная информация об этапах
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
    // Добавление этапа
    // -----------------------------------------------------

    function onMilestoneAdded(
        uint256 requestId,
        uint256 amount
    ) external;

    // -----------------------------------------------------
    // Изменение суммы этапа
    // -----------------------------------------------------

    function onMilestoneUpdated(
        uint256 requestId,
        uint256 oldAmount,
        uint256 newAmount
    ) external;

    // -----------------------------------------------------
    // Уведомление о выплате по этапу
    // -----------------------------------------------------

    function onMilestoneReleased(
        uint256 requestId,
        uint256 amount
    ) external;

    // -----------------------------------------------------
    // Уведомление об одобрении валидатором
    // -----------------------------------------------------

    function onValidatorApproved(
        address validator
    ) external;
}
