DROP procedure IF EXISTS `get_whatsapp_sends_by_customer`;
DELIMITER $$
CREATE PROCEDURE `get_whatsapp_sends_by_customer`(
  IN p_customerGuid CHAR(36)
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;

  SELECT
    w.id,
    w.sendGuid,
    w.invoiceId,
    i.invoiceGuid,
    i.invoiceNumber,
    w.customerId,
    w.phoneNumber,
    w.templateName,
    w.templateLanguage,
    w.templateVariables,
    w.attachmentUrl,
    w.metaMessageId,
    w.status,
    w.errorMessage,
    w.queuedAt,
    w.sentAt,
    w.deliveredAt,
    w.readAt
  FROM whatsappsendlog w
  LEFT JOIN invoices i ON i.id = w.invoiceId
  WHERE w.customerId = l_customerId
  ORDER BY w.queuedAt DESC, w.id DESC;
END$$
DELIMITER ;
