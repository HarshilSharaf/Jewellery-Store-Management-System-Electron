DROP procedure IF EXISTS `get_repair_ticket_details`;
DELIMITER $$
CREATE PROCEDURE `get_repair_ticket_details`(
  IN p_ticketGuid CHAR(36)
)
BEGIN
  SET time_zone = 'SYSTEM';

  SELECT
    t.id,
    t.ticketGuid,
    t.ticketNumber,
    t.customerId,
    c.customerGuid,
    CONCAT_WS(' ', c.firstName, c.lastName) AS customerName,
    c.phoneNumber                            AS customerPhone,
    c.email                                  AS customerEmail,
    t.receivedAt,
    t.receivedByUserId,
    u.userName                               AS receivedByUserName,
    t.itemDescription,
    t.itemPhotoPath,
    t.weight,
    t.estimatedCharge,
    t.estimatedReturnDate,
    t.status,
    t.actualCharge,
    t.paymentMode,
    t.paymentRef,
    t.deliveredAt,
    t.notes,
    t.karigarId,
    k.karigarGuid,
    k.name                                   AS karigarName,
    k.phone                                  AS karigarPhone,
    t.karigarJobId,
    j.jobGuid                                AS karigarJobGuid,
    t.createdAt,
    t.updatedAt
  FROM repairtickets t
  JOIN customers c              ON c.id  = t.customerId
  LEFT JOIN users u             ON u.uid = t.receivedByUserId
  LEFT JOIN karigars k          ON k.id  = t.karigarId
  LEFT JOIN karigarjobcards j   ON j.id  = t.karigarJobId
  WHERE t.ticketGuid = p_ticketGuid
    AND t.deletedAt IS NULL;
END$$
DELIMITER ;
