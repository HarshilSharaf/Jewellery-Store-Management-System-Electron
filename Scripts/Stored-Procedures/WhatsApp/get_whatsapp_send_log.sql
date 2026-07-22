DROP procedure IF EXISTS `get_whatsapp_send_log`;
DELIMITER $$
CREATE PROCEDURE `get_whatsapp_send_log`(
  IN p_customerGuid CHAR(36),
  IN p_status       VARCHAR(20),
  IN p_dateFrom     DATE,
  IN p_dateTo       DATE,
  IN p_pageSize     INT,
  IN p_page         INT
)
BEGIN
  DECLARE l_limit      INT DEFAULT 20;
  DECLARE l_offset     INT DEFAULT 0;
  DECLARE l_customerId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SET l_limit  = GREATEST(1, COALESCE(p_pageSize, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_page, 1) - 1) * l_limit);
  IF p_customerGuid IS NOT NULL AND p_customerGuid <> '' THEN
    SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;
  END IF;

  SELECT
    w.id,
    w.sendGuid,
    w.invoiceId,
    i.invoiceGuid,
    i.invoiceNumber,
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
    w.sentByUserId,
    u.userName AS sentByUserName,
    w.queuedAt,
    w.sentAt,
    w.deliveredAt,
    w.readAt
  FROM whatsappsendlog w
  JOIN customers c            ON c.id  = w.customerId
  LEFT JOIN invoices i        ON i.id  = w.invoiceId
  LEFT JOIN users u           ON u.uid = w.sentByUserId
  WHERE (l_customerId IS NULL OR w.customerId = l_customerId)
    AND (p_status     IS NULL OR p_status = '' OR w.status = p_status)
    AND (p_dateFrom   IS NULL OR DATE(w.queuedAt) >= p_dateFrom)
    AND (p_dateTo     IS NULL OR DATE(w.queuedAt) <= p_dateTo)
  ORDER BY w.queuedAt DESC, w.id DESC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM whatsappsendlog w
  WHERE (l_customerId IS NULL OR w.customerId = l_customerId)
    AND (p_status     IS NULL OR p_status = '' OR w.status = p_status)
    AND (p_dateFrom   IS NULL OR DATE(w.queuedAt) >= p_dateFrom)
    AND (p_dateTo     IS NULL OR DATE(w.queuedAt) <= p_dateTo);
END$$
DELIMITER ;
