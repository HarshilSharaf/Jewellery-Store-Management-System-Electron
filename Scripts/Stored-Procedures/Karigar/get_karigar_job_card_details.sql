DROP procedure IF EXISTS `get_karigar_job_card_details`;
DELIMITER $$
CREATE PROCEDURE `get_karigar_job_card_details`(
  IN p_jobGuid CHAR(36)
)
BEGIN
  SET time_zone = 'SYSTEM';

  SELECT
    j.id,
    j.jobGuid,
    j.karigarId,
    k.karigarGuid,
    k.name AS karigarName,
    k.phone AS karigarPhone,
    j.issueDate,
    j.expectedReturnDate,
    j.receivedDate,
    j.issuedGrossWeight,
    j.issuedPurityCode,
    j.issuedStones,
    j.receivedGrossWeight,
    j.receivedNetWeight,
    j.receivedStoneWeight,
    j.wastagePercentAllowed,
    j.wastageGramsActual,
    j.makingCharge,
    j.settlementAmount,
    j.settlementPaymentMode,
    j.settlementRefNumber,
    j.settledAt,
    j.productId,
    p.sku AS productSku,
    p.productDescription,
    j.description,
    j.remarks,
    j.status,
    j.createdAt,
    j.updatedAt
  FROM karigarjobcards j
  JOIN karigars k ON k.id = j.karigarId
  LEFT JOIN products p ON p.id = j.productId
  WHERE j.jobGuid = p_jobGuid;

  SELECT
    l.id,
    l.ledgerGuid,
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
  LEFT JOIN users u ON u.uid = l.actorUserId
  WHERE l.jobId = (SELECT id FROM karigarjobcards WHERE jobGuid = p_jobGuid)
  ORDER BY l.txnDate ASC, l.id ASC;
END$$
DELIMITER ;
