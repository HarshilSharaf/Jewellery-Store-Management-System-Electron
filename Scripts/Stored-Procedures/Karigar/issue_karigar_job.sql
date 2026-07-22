DROP procedure IF EXISTS `issue_karigar_job`;
DELIMITER $$
CREATE PROCEDURE `issue_karigar_job`(
  IN p_karigarGuid            CHAR(36),
  IN p_issueDate              DATE,
  IN p_issuedGrossWeight      DECIMAL(10, 3),
  IN p_issuedPurityCode       VARCHAR(10),
  IN p_issuedStones           JSON,
  IN p_expectedReturnDate     DATE,
  IN p_description            TEXT,
  IN p_actorUserId            INT
)
BEGIN
  DECLARE l_karigarId INT DEFAULT NULL;
  DECLARE l_jobGuid CHAR(36);
  DECLARE l_ledgerGuid CHAR(36);
  DECLARE l_jobId INT DEFAULT NULL;
  DECLARE l_issueDate DATE;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id INTO l_karigarId FROM karigars WHERE karigarGuid = p_karigarGuid AND deletedAt IS NULL;
  IF l_karigarId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'issue_karigar_job: karigar not found';
  END IF;

  SET l_jobGuid = UUID();
  SET l_ledgerGuid = UUID();
  SET l_issueDate = COALESCE(p_issueDate, CURDATE());

  START TRANSACTION;
    INSERT INTO karigarjobcards
      (jobGuid, karigarId, issueDate, expectedReturnDate,
       issuedGrossWeight, issuedPurityCode, issuedStones, description, status)
    VALUES
      (l_jobGuid, l_karigarId, l_issueDate, p_expectedReturnDate,
       COALESCE(p_issuedGrossWeight, 0), p_issuedPurityCode, p_issuedStones,
       p_description, 'issued');
    SET l_jobId = LAST_INSERT_ID();

    INSERT INTO karigarledger
      (ledgerGuid, karigarId, jobId, entryType, direction,
       weightGrams, amount, txnDate, notes, actorUserId)
    VALUES
      (l_ledgerGuid, l_karigarId, l_jobId, 'issue', 'debit',
       COALESCE(p_issuedGrossWeight, 0), 0, l_issueDate,
       CONCAT('Gold issued for job ', l_jobGuid), p_actorUserId);

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'issue_karigar_job', 'karigarjobcards', CAST(l_jobId AS CHAR),
            JSON_OBJECT('jobGuid', l_jobGuid, 'karigarId', l_karigarId,
                        'issuedGrossWeight', p_issuedGrossWeight));
  COMMIT;

  SELECT l_jobId AS jobId, l_jobGuid AS jobGuid;
END$$
DELIMITER ;
