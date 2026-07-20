DROP procedure IF EXISTS `link_repair_to_karigar`;
DELIMITER $$
CREATE PROCEDURE `link_repair_to_karigar`(
  IN p_ticketGuid     CHAR(36),
  IN p_karigarGuid    CHAR(36),
  IN p_karigarJobGuid CHAR(36),
  IN p_actorUserId    INT
)
BEGIN
  DECLARE l_ticketId    INT DEFAULT NULL;
  DECLARE l_karigarId   INT DEFAULT NULL;
  DECLARE l_jobId       INT DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id INTO l_ticketId FROM repairtickets
    WHERE ticketGuid = p_ticketGuid AND deletedAt IS NULL;
  IF l_ticketId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'link_repair_to_karigar: ticket not found';
  END IF;

  SELECT id INTO l_karigarId FROM karigars
    WHERE karigarGuid = p_karigarGuid AND deletedAt IS NULL;
  IF l_karigarId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'link_repair_to_karigar: karigar not found';
  END IF;

  IF p_karigarJobGuid IS NOT NULL AND p_karigarJobGuid <> '' THEN
    SELECT id INTO l_jobId FROM karigarjobcards WHERE jobGuid = p_karigarJobGuid;
    IF l_jobId IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'link_repair_to_karigar: karigar job not found';
    END IF;
  END IF;

  START TRANSACTION;
    UPDATE repairtickets
       SET karigarId    = l_karigarId,
           karigarJobId = l_jobId
     WHERE id = l_ticketId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'link_repair_to_karigar', 'repairtickets', CAST(l_ticketId AS CHAR),
            JSON_OBJECT('karigarId', l_karigarId, 'karigarJobId', l_jobId));
  COMMIT;

  SELECT l_ticketId AS ticketId, l_karigarId AS karigarId, l_jobId AS karigarJobId;
END$$
DELIMITER ;
