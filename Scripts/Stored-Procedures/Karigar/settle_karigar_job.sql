DROP procedure IF EXISTS `settle_karigar_job`;
DELIMITER $$
CREATE PROCEDURE `settle_karigar_job`(
  IN p_jobGuid          CHAR(36),
  IN p_settlementAmount DECIMAL(14, 2),
  IN p_paymentMode      VARCHAR(20),
  IN p_refNumber        VARCHAR(80),
  IN p_actorUserId      INT
)
BEGIN
  DECLARE l_jobId INT DEFAULT NULL;
  DECLARE l_karigarId INT DEFAULT NULL;
  DECLARE l_status VARCHAR(20);
  DECLARE l_ledgerGuid CHAR(36);

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id, karigarId, status INTO l_jobId, l_karigarId, l_status
    FROM karigarjobcards WHERE jobGuid = p_jobGuid LIMIT 1;
  IF l_jobId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'settle_karigar_job: job not found';
  END IF;
  IF l_status NOT IN ('received') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'settle_karigar_job: job is not in received state';
  END IF;

  SET l_ledgerGuid = UUID();

  START TRANSACTION;
    UPDATE karigarjobcards
       SET settlementAmount = COALESCE(p_settlementAmount, 0),
           settlementPaymentMode = p_paymentMode,
           settlementRefNumber = p_refNumber,
           settledAt = NOW(),
           status = 'settled'
     WHERE id = l_jobId;

    INSERT INTO karigarledger
      (ledgerGuid, karigarId, jobId, entryType, direction,
       weightGrams, amount, txnDate, notes, actorUserId)
    VALUES
      (l_ledgerGuid, l_karigarId, l_jobId, 'payment', 'debit',
       NULL, COALESCE(p_settlementAmount, 0), CURDATE(),
       CONCAT('Settlement ', COALESCE(p_paymentMode, 'cash'),
              COALESCE(CONCAT(' ref ', p_refNumber), '')), p_actorUserId);

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'settle_karigar_job', 'karigarjobcards', CAST(l_jobId AS CHAR),
            JSON_OBJECT('settlementAmount', p_settlementAmount, 'paymentMode', p_paymentMode));
  COMMIT;

  SELECT l_jobId AS jobId;
END$$
DELIMITER ;
