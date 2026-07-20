DROP procedure IF EXISTS `record_scheme_installment`;
DELIMITER $$
CREATE PROCEDURE `record_scheme_installment`(
  IN p_schemeGuid              CHAR(36),
  IN p_amount                  DECIMAL(12, 2),
  IN p_paymentMode             VARCHAR(20),
  IN p_refNumber               VARCHAR(80),
  IN p_receiptDate             DATE,
  IN p_actorUserId             INT,
  IN p_allowMultipleThisMonth  TINYINT(1)
)
BEGIN
  DECLARE l_schemeId INT DEFAULT NULL;
  DECLARE l_tenureMonths SMALLINT;
  DECLARE l_status VARCHAR(20);
  DECLARE l_installmentCount INT DEFAULT 0;
  DECLARE l_thisMonthCount INT DEFAULT 0;
  DECLARE l_nextInstallmentNumber SMALLINT DEFAULT 1;
  DECLARE l_installmentGuid CHAR(36);
  DECLARE l_receipt DATE;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';
  SET l_receipt = COALESCE(p_receiptDate, CURDATE());

  SELECT id, tenureMonths, status
    INTO l_schemeId, l_tenureMonths, l_status
    FROM savingschemes
   WHERE schemeGuid = p_schemeGuid
   LIMIT 1;

  IF l_schemeId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'record_scheme_installment: scheme not found';
  END IF;

  IF l_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'record_scheme_installment: scheme is not active';
  END IF;

  SELECT COUNT(*) INTO l_installmentCount
    FROM savingschemeinstallments WHERE schemeId = l_schemeId;

  IF l_installmentCount >= l_tenureMonths THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'record_scheme_installment: tenure already fulfilled';
  END IF;

  IF COALESCE(p_allowMultipleThisMonth, 0) = 0 THEN
    SELECT COUNT(*) INTO l_thisMonthCount
      FROM savingschemeinstallments
     WHERE schemeId = l_schemeId
       AND YEAR(receiptDate)  = YEAR(l_receipt)
       AND MONTH(receiptDate) = MONTH(l_receipt);
    IF l_thisMonthCount > 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'record_scheme_installment: installment already recorded this month';
    END IF;
  END IF;

  SET l_nextInstallmentNumber = l_installmentCount + 1;
  SET l_installmentGuid = UUID();

  START TRANSACTION;
    INSERT INTO savingschemeinstallments
      (installmentGuid, schemeId, installmentNumber, amount, paymentMode,
       refNumber, receiptDate, actorUserId)
    VALUES
      (l_installmentGuid, l_schemeId, l_nextInstallmentNumber, p_amount,
       COALESCE(p_paymentMode, 'cash'), p_refNumber, l_receipt, p_actorUserId);

    UPDATE savingschemes
       SET totalPaid = totalPaid + p_amount,
           status    = CASE WHEN l_nextInstallmentNumber >= l_tenureMonths THEN 'matured' ELSE 'active' END
     WHERE id = l_schemeId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'record_scheme_installment', 'savingschemes',
            CAST(l_schemeId AS CHAR),
            JSON_OBJECT('installmentNumber', l_nextInstallmentNumber,
                        'amount', p_amount, 'paymentMode', p_paymentMode));
  COMMIT;

  SELECT l_installmentGuid AS installmentGuid, l_nextInstallmentNumber AS installmentNumber,
         (SELECT totalPaid FROM savingschemes WHERE id = l_schemeId) AS totalPaid,
         (SELECT status FROM savingschemes WHERE id = l_schemeId) AS status;
END$$
DELIMITER ;
