DROP procedure IF EXISTS `save_old_gold_receipt`;
DELIMITER $$
CREATE PROCEDURE `save_old_gold_receipt`(
  IN p_customerGuid       CHAR(36),
  IN p_invoiceGuid        CHAR(36),
  IN p_grossWeight        DECIMAL(10, 3),
  IN p_testedPurityPercent DECIMAL(5, 2),
  IN p_testedPurityCode   VARCHAR(10),
  IN p_deductionPercent   DECIMAL(5, 2),
  IN p_ratePerGram        DECIMAL(12, 2),
  IN p_creditAmount       DECIMAL(14, 2),
  IN p_remarks            TEXT,
  IN p_actorUserId        INT
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;
  DECLARE l_invoiceId  INT DEFAULT NULL;
  DECLARE l_receiptGuid CHAR(36);

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    SELECT CONCAT('Error: ', error_code, ', ', error_msg) AS message;
  END;

  SET time_zone = 'SYSTEM';
  SET l_receiptGuid = UUID();

  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;
  IF l_customerId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'save_old_gold_receipt: customer not found';
  END IF;

  IF p_invoiceGuid IS NOT NULL THEN
    SELECT id INTO l_invoiceId FROM invoices WHERE invoiceGuid = p_invoiceGuid;
  END IF;

  START TRANSACTION;
    INSERT INTO oldgoldreceipts
      (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
       testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
    VALUES
      (l_receiptGuid, l_invoiceId, l_customerId, p_grossWeight, p_testedPurityCode,
       p_testedPurityPercent, COALESCE(p_deductionPercent, 0), p_ratePerGram,
       p_creditAmount, p_remarks);
    SET @l_receiptId := LAST_INSERT_ID();

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'save_old_gold_receipt', 'oldgoldreceipts',
            CAST(@l_receiptId AS CHAR),
            JSON_OBJECT('receiptGuid', l_receiptGuid, 'customerId', l_customerId,
                        'invoiceId', l_invoiceId, 'grossWeight', p_grossWeight,
                        'creditAmount', p_creditAmount));
  COMMIT;

  SELECT l_receiptGuid AS receiptGuid, @l_receiptId AS receiptId,
         l_invoiceId AS invoiceId, l_customerId AS customerId;
END$$
DELIMITER ;
