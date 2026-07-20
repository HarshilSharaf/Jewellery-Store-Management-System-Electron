DROP procedure IF EXISTS `update_repair_status`;
DELIMITER $$
CREATE PROCEDURE `update_repair_status`(
  IN p_ticketGuid    CHAR(36),
  IN p_newStatus     VARCHAR(20),
  IN p_actorUserId   INT,
  IN p_actualCharge  DECIMAL(12, 2),
  IN p_paymentMode   VARCHAR(20),
  IN p_paymentRef    VARCHAR(64)
)
BEGIN
  DECLARE l_ticketId    INT DEFAULT NULL;
  DECLARE l_currStatus  VARCHAR(20);
  DECLARE l_allowed     TINYINT DEFAULT 0;

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
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'update_repair_status: ticket not found';
  END IF;

  IF p_newStatus = 'declined' THEN
    SET l_allowed = 1;
  ELSEIF l_currStatus = 'received'    AND p_newStatus = 'in_progress' THEN SET l_allowed = 1;
  ELSEIF l_currStatus = 'in_progress' AND p_newStatus = 'ready'       THEN SET l_allowed = 1;
  ELSEIF l_currStatus = 'ready'       AND p_newStatus = 'delivered'   THEN SET l_allowed = 1;
  END IF;

  IF l_allowed = 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'update_repair_status: invalid transition';
  END IF;

  IF p_newStatus = 'delivered' THEN
    IF p_actualCharge IS NULL OR p_paymentMode IS NULL OR p_paymentMode = '' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'update_repair_status: delivered requires actualCharge and paymentMode';
    END IF;
  END IF;

  START TRANSACTION;
    UPDATE repairtickets
       SET status        = p_newStatus,
           actualCharge  = COALESCE(p_actualCharge,  actualCharge),
           paymentMode   = COALESCE(p_paymentMode,   paymentMode),
           paymentRef    = COALESCE(p_paymentRef,    paymentRef),
           deliveredAt   = CASE WHEN p_newStatus = 'delivered' THEN NOW() ELSE deliveredAt END
     WHERE id = l_ticketId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, `before`, `after`)
    VALUES (p_actorUserId, 'update_repair_status', 'repairtickets', CAST(l_ticketId AS CHAR),
            JSON_OBJECT('status', l_currStatus),
            JSON_OBJECT('status', p_newStatus, 'actualCharge', p_actualCharge,
                        'paymentMode', p_paymentMode, 'paymentRef', p_paymentRef));
  COMMIT;

  SELECT l_ticketId AS ticketId, p_newStatus AS status;
END$$
DELIMITER ;
