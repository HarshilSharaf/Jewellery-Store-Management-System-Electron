DROP procedure IF EXISTS `forfeit_saving_scheme`;
DELIMITER $$
CREATE PROCEDURE `forfeit_saving_scheme`(
  IN p_schemeGuid   CHAR(36),
  IN p_reason       VARCHAR(255),
  IN p_actorUserId  INT
)
BEGIN
  DECLARE l_schemeId INT DEFAULT NULL;
  DECLARE l_status VARCHAR(20);
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type <> 'admin' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canForfeitSavingScheme';
    END IF;
  END IF;

  SELECT id, status INTO l_schemeId, l_status
    FROM savingschemes WHERE schemeGuid = p_schemeGuid LIMIT 1;
  IF l_schemeId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forfeit_saving_scheme: scheme not found';
  END IF;

  IF l_status = 'redeemed' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forfeit_saving_scheme: scheme already redeemed';
  END IF;

  START TRANSACTION;
    UPDATE savingschemes
       SET status = 'forfeited',
           forfeitedAt = NOW(),
           forfeitReason = p_reason
     WHERE id = l_schemeId;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'forfeit_saving_scheme', 'savingschemes',
            CAST(l_schemeId AS CHAR),
            JSON_OBJECT('reason', p_reason));
  COMMIT;

  SELECT l_schemeId AS schemeId, 'forfeited' AS status;
END$$
DELIMITER ;
