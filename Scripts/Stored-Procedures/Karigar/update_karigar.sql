DROP procedure IF EXISTS `update_karigar`;
DELIMITER $$
CREATE PROCEDURE `update_karigar`(
  IN p_karigarGuid  CHAR(36),
  IN p_name         VARCHAR(120),
  IN p_phone        VARCHAR(20),
  IN p_address      VARCHAR(255),
  IN p_remarks      TEXT,
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
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'update_karigar: karigar not found';
  END IF;

  START TRANSACTION;
    UPDATE karigars
       SET name    = COALESCE(p_name, name),
           phone   = p_phone,
           address = p_address,
           remarks = p_remarks
     WHERE id = l_karigarId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'update_karigar', 'karigars', CAST(l_karigarId AS CHAR),
            JSON_OBJECT('name', p_name, 'phone', p_phone));
  COMMIT;

  SELECT l_karigarId AS karigarId;
END$$
DELIMITER ;
