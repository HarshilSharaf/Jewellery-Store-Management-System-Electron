DROP procedure IF EXISTS `save_order`;
DELIMITER $$
CREATE PROCEDURE `save_order`(
  IN  p_soldToCustomer     INT,
  IN  p_placeOfSupply      VARCHAR(80),
  IN  p_hsn                VARCHAR(8),
  IN  p_rateSnapshot       JSON,
  IN  p_subTotalTaxable    DECIMAL(14, 2),
  IN  p_totalCgst          DECIMAL(14, 2),
  IN  p_totalSgst          DECIMAL(14, 2),
  IN  p_totalIgst          DECIMAL(14, 2),
  IN  p_totalDiscount      DECIMAL(14, 2),
  IN  p_totalMakingCharge  DECIMAL(14, 2),
  IN  p_totalStoneCharge   DECIMAL(14, 2),
  IN  p_totalWastageCharge DECIMAL(14, 2),
  IN  p_oldGoldCreditAmount DECIMAL(14, 2),
  IN  p_roundOffAmount     DECIMAL(6, 2),
  IN  p_grandTotal         DECIMAL(14, 2),
  IN  p_remarks            TEXT,
  IN  p_amountPaid         DECIMAL(14, 2),
  IN  p_paymentMethod      VARCHAR(20),
  IN  p_paymentRefNumber   VARCHAR(80),
  IN  p_lineItems          JSON,
  IN  p_oldGoldReceipts    JSON
)
BEGIN
  DECLARE l_invoiceGuid CHAR(36);
  DECLARE l_paymentGuid CHAR(36);
  DECLARE l_invoiceId INT DEFAULT NULL;
  DECLARE l_prefix VARCHAR(20);
  DECLARE l_counter INT;
  DECLARE l_invoiceNumber VARCHAR(40);
  DECLARE i INT DEFAULT 0;
  DECLARE arr_len INT DEFAULT 0;
  DECLARE og_i INT DEFAULT 0;
  DECLARE og_len INT DEFAULT 0;
  DECLARE l_productId VARCHAR(32);
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
  SET l_invoiceGuid = UUID();

  SELECT invoicePrefix, currentInvoiceCounter
    INTO l_prefix, l_counter
    FROM shopsettings
   WHERE id = 1
   FOR UPDATE;

  IF l_prefix IS NULL THEN
    SET l_prefix = 'INV/';
    SET l_counter = 1;
  END IF;

  SET l_invoiceNumber = CONCAT(l_prefix, LPAD(l_counter, 5, '0'));

  START TRANSACTION;

    INSERT INTO invoices
      (invoiceGuid, invoiceNumber, hsn, placeOfSupply, rateSnapshot,
       subTotalTaxable, totalCgst, totalSgst, totalIgst, totalDiscount,
       totalMakingCharge, totalStoneCharge, totalWastageCharge,
       oldGoldCreditAmount, roundOffAmount, grandTotal,
       isPaymentDone, remarks, soldToCustomer)
    VALUES
      (l_invoiceGuid, l_invoiceNumber, COALESCE(p_hsn, '7113'),
       p_placeOfSupply, p_rateSnapshot,
       p_subTotalTaxable, p_totalCgst, p_totalSgst, p_totalIgst, p_totalDiscount,
       p_totalMakingCharge, p_totalStoneCharge, p_totalWastageCharge,
       p_oldGoldCreditAmount, p_roundOffAmount, p_grandTotal,
       (CASE WHEN p_amountPaid >= p_grandTotal THEN 1 ELSE 0 END),
       p_remarks, p_soldToCustomer);

    SET l_invoiceId = LAST_INSERT_ID();

    UPDATE shopsettings
       SET currentInvoiceCounter = l_counter + 1
     WHERE id = 1;

    IF p_amountPaid IS NOT NULL AND p_amountPaid > 0 THEN
      SET l_paymentGuid = UUID();
      INSERT INTO payments
        (paymentGuid, invoiceId, amount, paymentType, refNumber, remarks)
      VALUES
        (l_paymentGuid, l_invoiceId, p_amountPaid, p_paymentMethod,
         p_paymentRefNumber, 'Paid while creating order');
    END IF;

    IF p_lineItems IS NOT NULL THEN
      SET arr_len = JSON_LENGTH(p_lineItems);
      WHILE i < arr_len DO
        SET l_productId = JSON_UNQUOTE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].productId')));
        INSERT INTO invoicelineitems
          (invoiceId, productId, lineType, description, hsnCode, purityCode,
           grossWeight, netWeight, stoneWeight, ratePerGram, metalValue,
           makingCharge, stoneCharge, wastageCharge, discountAmount,
           taxableAmount, cgst, sgst, igst, lineTotal)
        VALUES
          (l_invoiceId,
           CASE WHEN l_productId IS NULL OR l_productId = 'null' OR l_productId = '' THEN NULL
                ELSE CAST(l_productId AS UNSIGNED) END,
           COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].lineType'))), 'product'),
           JSON_UNQUOTE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].description'))),
           JSON_UNQUOTE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].hsnCode'))),
           JSON_UNQUOTE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].purityCode'))),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].grossWeight')),   0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].netWeight')),     0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].stoneWeight')),   0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].ratePerGram')),   0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].metalValue')),    0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].makingCharge')),  0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].stoneCharge')),   0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].wastageCharge')), 0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].discountAmount')), 0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].taxableAmount')), 0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].cgst')),          0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].sgst')),          0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].igst')),          0),
           COALESCE(JSON_EXTRACT(p_lineItems, CONCAT('$[', i, '].lineTotal')),     0));

        IF l_productId IS NOT NULL AND l_productId <> 'null' AND l_productId <> '' THEN
          UPDATE products SET isSold = 1 WHERE id = CAST(l_productId AS UNSIGNED);
        END IF;

        SET i = i + 1;
      END WHILE;
    END IF;

    IF p_oldGoldReceipts IS NOT NULL THEN
      SET og_len = JSON_LENGTH(p_oldGoldReceipts);
      WHILE og_i < og_len DO
        SET l_receiptGuid = UUID();
        INSERT INTO oldgoldreceipts
          (receiptGuid, invoiceId, customerId, grossWeight, testedPurityCode,
           testedPurityPercent, deductionPercent, ratePerGram, creditAmount, remarks)
        VALUES
          (l_receiptGuid,
           l_invoiceId,
           p_soldToCustomer,
           COALESCE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].grossWeight')), 0),
           JSON_UNQUOTE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].testedPurityCode'))),
           JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].testedPurityPercent')),
           COALESCE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].deductionPercent')), 0),
           COALESCE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].ratePerGram')), 0),
           COALESCE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].creditAmount')), 0),
           JSON_UNQUOTE(JSON_EXTRACT(p_oldGoldReceipts, CONCAT('$[', og_i, '].remarks'))));
        SET og_i = og_i + 1;
      END WHILE;
    END IF;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (NULL, 'save_order', 'invoices', CAST(l_invoiceId AS CHAR),
            JSON_OBJECT('invoiceNumber', l_invoiceNumber, 'grandTotal', p_grandTotal));

  COMMIT;

  SELECT l_invoiceId AS invoiceId, l_invoiceGuid AS invoiceGuid, l_invoiceNumber AS invoiceNumber;
END$$

DELIMITER ;
