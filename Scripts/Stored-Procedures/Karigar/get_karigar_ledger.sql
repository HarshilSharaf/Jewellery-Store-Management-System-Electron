DROP procedure IF EXISTS `get_karigar_ledger`;
DELIMITER $$
CREATE PROCEDURE `get_karigar_ledger`(
  IN p_karigarGuid CHAR(36),
  IN p_dateFrom    DATE,
  IN p_dateTo      DATE
)
BEGIN
  DECLARE l_karigarId INT DEFAULT NULL;
  DECLARE l_from DATE;
  DECLARE l_to   DATE;

  SET time_zone = 'SYSTEM';
  SELECT id INTO l_karigarId FROM karigars WHERE karigarGuid = p_karigarGuid;
  SET l_from = COALESCE(p_dateFrom, DATE_SUB(CURDATE(), INTERVAL 90 DAY));
  SET l_to   = COALESCE(p_dateTo,   CURDATE());

  SELECT
    k.id            AS karigarId,
    k.karigarGuid,
    k.name          AS karigarName,
    l_from          AS dateFrom,
    l_to            AS dateTo,
    COALESCE(SUM(CASE WHEN l.entryType = 'issue'   THEN l.weightGrams END), 0) AS issuedGrams,
    COALESCE(SUM(CASE WHEN l.entryType = 'receive' THEN l.weightGrams END), 0) AS receivedGrams,
    COALESCE(SUM(CASE WHEN l.entryType = 'issue'   THEN l.weightGrams END), 0)
      - COALESCE(SUM(CASE WHEN l.entryType = 'receive' THEN l.weightGrams END), 0) AS netMetalOutstandingGrams,
    COALESCE(SUM(CASE WHEN l.entryType = 'adjustment' AND l.direction = 'credit' THEN l.amount END), 0) AS makingAccrued,
    COALESCE(SUM(CASE WHEN l.entryType = 'payment'                                THEN l.amount END), 0) AS paymentsMade,
    COALESCE(SUM(CASE WHEN l.entryType = 'adjustment' AND l.direction = 'credit' THEN l.amount END), 0)
      - COALESCE(SUM(CASE WHEN l.entryType = 'payment' THEN l.amount END), 0) AS balanceDue
  FROM karigars k
  LEFT JOIN karigarledger l
    ON l.karigarId = k.id AND l.txnDate BETWEEN l_from AND l_to
  WHERE k.id = l_karigarId
  GROUP BY k.id, k.karigarGuid, k.name;

  SELECT
    l.id,
    l.ledgerGuid,
    l.jobId,
    j.jobGuid,
    l.entryType,
    l.direction,
    l.weightGrams,
    l.amount,
    l.txnDate,
    l.notes,
    l.actorUserId,
    u.userName AS actorUserName,
    l.createdAt
  FROM karigarledger l
  LEFT JOIN karigarjobcards j ON j.id = l.jobId
  LEFT JOIN users u ON u.uid = l.actorUserId
  WHERE l.karigarId = l_karigarId
    AND l.txnDate BETWEEN l_from AND l_to
  ORDER BY l.txnDate ASC, l.id ASC;
END$$
DELIMITER ;
