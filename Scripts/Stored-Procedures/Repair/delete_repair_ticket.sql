DROP procedure IF EXISTS `delete_repair_ticket`;
DELIMITER $$
CREATE PROCEDURE `delete_repair_ticket`(
  IN p_ticketGuid  CHAR(36),
  IN p_actorUserId INT
)
BEGIN
  DECLARE l_ticketId    INT DEFAULT NULL;
  DECLARE l_actor_type  VARCHAR(20) DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT type INTO l_actor_type FROM users WHERE uid = p_actorUserId;
  IF l_actor_type = 'employee' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canDeleteRepair';
  END IF;

  SELECT id INTO l_ticketId FROM repairtickets
    WHERE ticketGuid = p_ticketGuid AND deletedAt IS NULL;
  IF l_ticketId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'delete_repair_ticket: ticket not found';
  END IF;

  START TRANSACTION;
    UPDATE repairtickets SET deletedAt = NOW() WHERE id = l_ticketId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'delete_repair_ticket', 'repairtickets', CAST(l_ticketId AS CHAR),
            JSON_OBJECT('deletedAt', NOW()));
  COMMIT;

  SELECT l_ticketId AS ticketId;
END$$
DELIMITER ;
