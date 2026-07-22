DROP procedure IF EXISTS `add_karigar`;
DELIMITER $$
CREATE PROCEDURE `add_karigar`(
  IN p_name         VARCHAR(120),
  IN p_phone        VARCHAR(20),
  IN p_address      VARCHAR(255),
  IN p_remarks      TEXT,
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_karigarGuid CHAR(36);
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
  SET l_karigarGuid = UUID();

  START TRANSACTION;
    INSERT INTO karigars (karigarGuid, name, phone, address, remarks)
    VALUES (l_karigarGuid, p_name, p_phone, p_address, p_remarks);
    SET l_karigarId = LAST_INSERT_ID();

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'add_karigar', 'karigars', CAST(l_karigarId AS CHAR),
            JSON_OBJECT('karigarGuid', l_karigarGuid, 'name', p_name, 'phone', p_phone));
  COMMIT;

  SELECT l_karigarId AS karigarId, l_karigarGuid AS karigarGuid;
END$$
DELIMITER ;
