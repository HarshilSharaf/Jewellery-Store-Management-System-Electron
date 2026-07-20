DROP procedure IF EXISTS `get_repair_tickets_by_customer`;
DELIMITER $$
CREATE PROCEDURE `get_repair_tickets_by_customer`(
  IN p_customerGuid CHAR(36)
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;

  SELECT
    t.id,
    t.ticketGuid,
    t.ticketNumber,
    t.customerId,
    t.receivedAt,
    t.itemDescription,
    t.weight,
    t.estimatedCharge,
    t.estimatedReturnDate,
    t.status,
    t.actualCharge,
    t.paymentMode,
    t.deliveredAt,
    t.karigarId,
    k.name AS karigarName,
    t.createdAt
  FROM repairtickets t
  LEFT JOIN karigars k ON k.id = t.karigarId
  WHERE t.customerId = l_customerId
    AND t.deletedAt IS NULL
  ORDER BY t.receivedAt DESC, t.id DESC;
END$$
DELIMITER ;
