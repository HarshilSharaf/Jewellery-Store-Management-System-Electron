DROP procedure IF EXISTS `create_repair_ticket`;
DELIMITER $$
CREATE PROCEDURE `create_repair_ticket`(
  IN p_customerGuid         CHAR(36),
  IN p_receivedByUserId     INT,
  IN p_itemDescription      VARCHAR(500),
  IN p_itemPhotoPath        VARCHAR(500),
  IN p_weight               DECIMAL(10, 3),
  IN p_estimatedCharge      DECIMAL(12, 2),
  IN p_estimatedReturnDate  DATE,
  IN p_notes                VARCHAR(1000),
  IN p_karigarGuid          CHAR(36)
)
BEGIN
  DECLARE l_customerId    INT DEFAULT NULL;
  DECLARE l_karigarId     INT DEFAULT NULL;
  DECLARE l_ticketGuid    CHAR(36);
  DECLARE l_ticketId      INT DEFAULT NULL;
  DECLARE l_prefix        VARCHAR(32);
  DECLARE l_counter       INT DEFAULT 1;
  DECLARE l_ticketNumber  VARCHAR(32);

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;
  IF l_customerId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'create_repair_ticket: customer not found';
  END IF;

  IF p_karigarGuid IS NOT NULL AND p_karigarGuid <> '' THEN
    SELECT id INTO l_karigarId FROM karigars WHERE karigarGuid = p_karigarGuid AND deletedAt IS NULL;
    IF l_karigarId IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'create_repair_ticket: karigar not found';
    END IF;
  END IF;

  SET l_ticketGuid = UUID();

  START TRANSACTION;
    SELECT repairPrefix, currentRepairCounter
      INTO l_prefix, l_counter
      FROM shopsettings WHERE id = 1
      FOR UPDATE;

    SET l_ticketNumber = CONCAT(l_prefix, LPAD(l_counter, 5, '0'));

    UPDATE shopsettings SET currentRepairCounter = l_counter + 1 WHERE id = 1;

    INSERT INTO repairtickets
      (ticketGuid, ticketNumber, customerId, receivedByUserId, itemDescription,
       itemPhotoPath, weight, estimatedCharge, estimatedReturnDate, status,
       notes, karigarId)
    VALUES
      (l_ticketGuid, l_ticketNumber, l_customerId, p_receivedByUserId, p_itemDescription,
       p_itemPhotoPath, p_weight, p_estimatedCharge, p_estimatedReturnDate, 'received',
       p_notes, l_karigarId);
    SET l_ticketId = LAST_INSERT_ID();

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_receivedByUserId, 'create_repair_ticket', 'repairtickets', CAST(l_ticketId AS CHAR),
            JSON_OBJECT('ticketGuid', l_ticketGuid, 'ticketNumber', l_ticketNumber,
                        'customerId', l_customerId, 'karigarId', l_karigarId,
                        'estimatedCharge', p_estimatedCharge));
  COMMIT;

  SELECT l_ticketId AS ticketId, l_ticketGuid AS ticketGuid, l_ticketNumber AS ticketNumber;
END$$
DELIMITER ;
