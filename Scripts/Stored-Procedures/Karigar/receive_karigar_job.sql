DROP procedure IF EXISTS `receive_karigar_job`;
DELIMITER $$
CREATE PROCEDURE `receive_karigar_job`(
  IN p_jobGuid              CHAR(36),
  IN p_receivedDate         DATE,
  IN p_receivedGrossWeight  DECIMAL(10, 3),
  IN p_receivedNetWeight    DECIMAL(10, 3),
  IN p_receivedStoneWeight  DECIMAL(10, 3),
  IN p_wastagePercentAllowed DECIMAL(5, 2),
  IN p_wastageGramsActual   DECIMAL(10, 3),
  IN p_makingCharge         DECIMAL(14, 2),
  IN p_remarks              TEXT,
  IN p_actorUserId          INT
)
BEGIN
  DECLARE l_jobId INT DEFAULT NULL;
  DECLARE l_karigarId INT DEFAULT NULL;
  DECLARE l_status VARCHAR(20);
  DECLARE l_receivedDate DATE;
  DECLARE l_ledgerGuid CHAR(36);
  DECLARE l_makingLedgerGuid CHAR(36);

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
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receive_karigar_job: job not found';
  END IF;
  IF l_status <> 'issued' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'receive_karigar_job: job is not in issued state';
  END IF;

  SET l_receivedDate = COALESCE(p_receivedDate, CURDATE());
  SET l_ledgerGuid = UUID();
  SET l_makingLedgerGuid = UUID();

  START TRANSACTION;
    UPDATE karigarjobcards
       SET receivedDate = l_receivedDate,
           receivedGrossWeight  = COALESCE(p_receivedGrossWeight, 0),
           receivedNetWeight    = COALESCE(p_receivedNetWeight, 0),
           receivedStoneWeight  = COALESCE(p_receivedStoneWeight, 0),
           wastagePercentAllowed = COALESCE(p_wastagePercentAllowed, 0),
           wastageGramsActual    = COALESCE(p_wastageGramsActual, 0),
           makingCharge = COALESCE(p_makingCharge, 0),
           remarks = p_remarks,
           status = 'received'
     WHERE id = l_jobId;

    INSERT INTO karigarledger
      (ledgerGuid, karigarId, jobId, entryType, direction,
       weightGrams, amount, txnDate, notes, actorUserId)
    VALUES
      (l_ledgerGuid, l_karigarId, l_jobId, 'receive', 'credit',
       COALESCE(p_receivedGrossWeight, 0), 0, l_receivedDate,
       CONCAT('Job received (wastage ', COALESCE(p_wastageGramsActual, 0), 'g)'),
       p_actorUserId);

    IF COALESCE(p_makingCharge, 0) > 0 THEN
      INSERT INTO karigarledger
        (ledgerGuid, karigarId, jobId, entryType, direction,
         weightGrams, amount, txnDate, notes, actorUserId)
      VALUES
        (l_makingLedgerGuid, l_karigarId, l_jobId, 'adjustment', 'credit',
         NULL, COALESCE(p_makingCharge, 0), l_receivedDate,
         'Making charge accrued', p_actorUserId);
    END IF;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'receive_karigar_job', 'karigarjobcards', CAST(l_jobId AS CHAR),
            JSON_OBJECT('receivedGrossWeight', p_receivedGrossWeight,
                        'wastageGramsActual', p_wastageGramsActual,
                        'makingCharge', p_makingCharge));
  COMMIT;

  SELECT l_jobId AS jobId;
END$$
DELIMITER ;
