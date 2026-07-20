DROP procedure IF EXISTS `get_all_karigar_jobs`;
DELIMITER $$
CREATE PROCEDURE `get_all_karigar_jobs`(
  IN p_itemsPerPage INT,
  IN p_pageNumber   INT,
  IN p_karigarGuid  CHAR(36),
  IN p_statusFilter VARCHAR(20)
)
BEGIN
  DECLARE l_offset INT DEFAULT 0;
  DECLARE l_limit  INT DEFAULT 20;
  DECLARE l_karigarId INT DEFAULT NULL;

  SET time_zone = 'SYSTEM';
  SET l_limit  = GREATEST(1, COALESCE(p_itemsPerPage, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_pageNumber, 1) - 1) * l_limit);
  IF p_karigarGuid IS NOT NULL AND p_karigarGuid <> '' THEN
    SELECT id INTO l_karigarId FROM karigars WHERE karigarGuid = p_karigarGuid;
  END IF;

  SELECT
    j.id,
    j.jobGuid,
    j.karigarId,
    k.karigarGuid,
    k.name AS karigarName,
    j.issueDate,
    j.expectedReturnDate,
    j.receivedDate,
    j.issuedGrossWeight,
    j.issuedPurityCode,
    j.receivedGrossWeight,
    j.receivedNetWeight,
    j.wastageGramsActual,
    j.makingCharge,
    j.settlementAmount,
    j.status,
    j.createdAt
  FROM karigarjobcards j
  JOIN karigars k ON k.id = j.karigarId
  WHERE j.deletedAt IS NULL
    AND (l_karigarId IS NULL OR j.karigarId = l_karigarId)
    AND (p_statusFilter IS NULL OR p_statusFilter = '' OR j.status = p_statusFilter)
  ORDER BY j.issueDate DESC, j.id DESC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM karigarjobcards j
  WHERE j.deletedAt IS NULL
    AND (l_karigarId IS NULL OR j.karigarId = l_karigarId)
    AND (p_statusFilter IS NULL OR p_statusFilter = '' OR j.status = p_statusFilter);
END$$
DELIMITER ;
