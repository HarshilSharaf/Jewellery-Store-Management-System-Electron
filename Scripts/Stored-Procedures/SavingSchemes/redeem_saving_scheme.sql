DROP procedure IF EXISTS `redeem_saving_scheme`;
DELIMITER $$
CREATE PROCEDURE `redeem_saving_scheme`(
  IN p_schemeGuid   CHAR(36),
  IN p_invoiceGuid  CHAR(36),
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_schemeId INT DEFAULT NULL;
  DECLARE l_invoiceId INT DEFAULT NULL;
  DECLARE l_monthly DECIMAL(12, 2) DEFAULT 0;
  DECLARE l_bonus SMALLINT DEFAULT 0;
  DECLARE l_totalPaid DECIMAL(14, 2) DEFAULT 0;
  DECLARE l_corpus DECIMAL(14, 2) DEFAULT 0;
  DECLARE l_status VARCHAR(20);

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id, monthlyAmount, bonusInstallments, totalPaid, status
    INTO l_schemeId, l_monthly, l_bonus, l_totalPaid, l_status
    FROM savingschemes WHERE schemeGuid = p_schemeGuid LIMIT 1;
  IF l_schemeId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'redeem_saving_scheme: scheme not found';
  END IF;

  IF l_status NOT IN ('active', 'matured') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'redeem_saving_scheme: scheme is not redeemable';
  END IF;

  IF p_invoiceGuid IS NOT NULL THEN
    SELECT id INTO l_invoiceId FROM invoices WHERE invoiceGuid = p_invoiceGuid LIMIT 1;
    IF l_invoiceId IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'redeem_saving_scheme: invoice not found';
    END IF;
  END IF;

  SET l_corpus = l_totalPaid + (l_monthly * l_bonus);

  START TRANSACTION;
    UPDATE savingschemes
       SET status = 'redeemed',
           redeemedInvoiceId = l_invoiceId,
           redeemedAmount = l_corpus,
           redeemedAt = NOW()
     WHERE id = l_schemeId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'redeem_saving_scheme', 'savingschemes',
            CAST(l_schemeId AS CHAR),
            JSON_OBJECT('invoiceId', l_invoiceId, 'corpus', l_corpus));
  COMMIT;

  SELECT l_schemeId AS schemeId, l_corpus AS redeemedAmount, l_invoiceId AS invoiceId;
END$$
DELIMITER ;
