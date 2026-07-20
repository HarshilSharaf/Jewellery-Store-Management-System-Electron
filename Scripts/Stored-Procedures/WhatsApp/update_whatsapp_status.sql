DROP procedure IF EXISTS `update_whatsapp_status`;
DELIMITER $$
CREATE PROCEDURE `update_whatsapp_status`(
  IN p_sendGuid       CHAR(36),
  IN p_newStatus      VARCHAR(20),
  IN p_metaMessageId  VARCHAR(128),
  IN p_errorMessage   VARCHAR(1000),
  IN p_actorUserId    INT
)
BEGIN
  DECLARE l_sendId INT DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id INTO l_sendId FROM whatsappsendlog WHERE sendGuid = p_sendGuid;
  IF l_sendId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'update_whatsapp_status: send log row not found';
  END IF;

  IF p_newStatus NOT IN ('queued', 'sent', 'delivered', 'read', 'failed') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'update_whatsapp_status: invalid status';
  END IF;

  START TRANSACTION;
    UPDATE whatsappsendlog
       SET status         = p_newStatus,
           metaMessageId  = COALESCE(p_metaMessageId, metaMessageId),
           errorMessage   = COALESCE(p_errorMessage, errorMessage),
           sentAt         = CASE WHEN p_newStatus = 'sent'      AND sentAt      IS NULL THEN NOW() ELSE sentAt      END,
           deliveredAt    = CASE WHEN p_newStatus = 'delivered' AND deliveredAt IS NULL THEN NOW() ELSE deliveredAt END,
           readAt         = CASE WHEN p_newStatus = 'read'      AND readAt      IS NULL THEN NOW() ELSE readAt      END
     WHERE id = l_sendId;
  COMMIT;

  SELECT l_sendId AS sendId, p_newStatus AS status;
END$$
DELIMITER ;
