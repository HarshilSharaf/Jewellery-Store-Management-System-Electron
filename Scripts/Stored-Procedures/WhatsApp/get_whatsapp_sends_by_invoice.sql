DROP procedure IF EXISTS `get_whatsapp_sends_by_invoice`;
DELIMITER $$
CREATE PROCEDURE `get_whatsapp_sends_by_invoice`(
  IN p_invoiceGuid CHAR(36)
)
BEGIN
  DECLARE l_invoiceId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_invoiceId FROM invoices WHERE invoiceGuid = p_invoiceGuid;

  SELECT
    w.id,
    w.sendGuid,
    w.invoiceId,
    w.customerId,
    c.customerGuid,
    CONCAT_WS(' ', c.firstName, c.lastName) AS customerName,
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
  JOIN customers c ON c.id = w.customerId
  WHERE w.invoiceId = l_invoiceId
  ORDER BY w.queuedAt DESC, w.id DESC;
END$$
DELIMITER ;
