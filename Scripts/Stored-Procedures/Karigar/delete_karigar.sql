DROP procedure IF EXISTS `delete_karigar`;
DELIMITER $$
CREATE PROCEDURE `delete_karigar`(
  IN p_karigarGuid  CHAR(36),
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_karigarId INT DEFAULT NULL;

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
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'delete_karigar: karigar not found';
  END IF;

  START TRANSACTION;
    UPDATE karigars SET deletedAt = NOW() WHERE id = l_karigarId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'delete_karigar', 'karigars', CAST(l_karigarId AS CHAR),
            JSON_OBJECT('deletedAt', NOW()));
  COMMIT;

  SELECT l_karigarId AS karigarId;
END$$
DELIMITER ;
