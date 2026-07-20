DROP procedure IF EXISTS `settle_repair_ticket`;
DELIMITER $$
CREATE PROCEDURE `settle_repair_ticket`(
  IN p_ticketGuid    CHAR(36),
  IN p_actualCharge  DECIMAL(12, 2),
  IN p_paymentMode   VARCHAR(20),
  IN p_paymentRef    VARCHAR(64),
  IN p_actorUserId   INT
)
BEGIN
  DECLARE l_ticketId    INT DEFAULT NULL;
  DECLARE l_currStatus  VARCHAR(20);

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id, status INTO l_ticketId, l_currStatus
    FROM repairtickets
    WHERE ticketGuid = p_ticketGuid AND deletedAt IS NULL
    LIMIT 1;
  IF l_ticketId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'settle_repair_ticket: ticket not found';
  END IF;
  IF l_currStatus <> 'ready' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'settle_repair_ticket: ticket is not in ready state';
  END IF;
  IF p_actualCharge IS NULL OR p_paymentMode IS NULL OR p_paymentMode = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'settle_repair_ticket: actualCharge and paymentMode required';
  END IF;

  START TRANSACTION;
    UPDATE repairtickets
       SET status       = 'delivered',
           actualCharge = p_actualCharge,
           paymentMode  = p_paymentMode,
           paymentRef   = p_paymentRef,
           deliveredAt  = NOW()
     WHERE id = l_ticketId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, `before`, `after`)
    VALUES (p_actorUserId, 'settle_repair_ticket', 'repairtickets', CAST(l_ticketId AS CHAR),
            JSON_OBJECT('status', l_currStatus),
            JSON_OBJECT('status', 'delivered', 'actualCharge', p_actualCharge,
                        'paymentMode', p_paymentMode, 'paymentRef', p_paymentRef));
  COMMIT;

  SELECT l_ticketId AS ticketId, 'delivered' AS status;
END$$
DELIMITER ;
