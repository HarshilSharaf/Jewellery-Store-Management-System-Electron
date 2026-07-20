DROP procedure IF EXISTS `queue_whatsapp_send`;
DELIMITER $$
CREATE PROCEDURE `queue_whatsapp_send`(
  IN p_invoiceGuid           CHAR(36),
  IN p_customerGuid          CHAR(36),
  IN p_templateName          VARCHAR(128),
  IN p_templateLanguage      VARCHAR(16),
  IN p_templateVariablesJson JSON,
  IN p_attachmentUrl         VARCHAR(1024),
  IN p_phoneNumber           VARCHAR(24),
  IN p_sentByUserId          INT
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;
  DECLARE l_invoiceId  INT DEFAULT NULL;
  DECLARE l_sendGuid   CHAR(36);
  DECLARE l_sendId     INT DEFAULT NULL;

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
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'queue_whatsapp_send: customer not found';
  END IF;

  IF p_invoiceGuid IS NOT NULL AND p_invoiceGuid <> '' THEN
    SELECT id INTO l_invoiceId FROM invoices WHERE invoiceGuid = p_invoiceGuid;
  END IF;

  SET l_sendGuid = UUID();

  START TRANSACTION;
    INSERT INTO whatsappsendlog
      (sendGuid, invoiceId, customerId, templateName, templateLanguage,
       templateVariables, attachmentUrl, phoneNumber, status, sentByUserId)
    VALUES
      (l_sendGuid, l_invoiceId, l_customerId, p_templateName,
       COALESCE(p_templateLanguage, 'en'), p_templateVariablesJson,
       p_attachmentUrl, p_phoneNumber, 'queued', p_sentByUserId);
    SET l_sendId = LAST_INSERT_ID();
  COMMIT;

  SELECT l_sendId AS sendId, l_sendGuid AS sendGuid;
END$$
DELIMITER ;
