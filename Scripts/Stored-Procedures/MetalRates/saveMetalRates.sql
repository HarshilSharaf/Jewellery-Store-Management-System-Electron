DROP procedure IF EXISTS `save_metal_rates`;
DELIMITER $$
CREATE PROCEDURE `save_metal_rates`(
  IN p_effectiveDate DATE,
  IN p_session       VARCHAR(2),
  IN p_source        VARCHAR(10),
  IN p_setByUserId   INT,
  IN p_rates         JSON
)
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE arr_len INT DEFAULT 0;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    SELECT CONCAT('Error: ', error_code, ', ', error_msg) AS message;
  END;

  SET time_zone = 'SYSTEM';
  SET arr_len = JSON_LENGTH(p_rates);

  START TRANSACTION;
    WHILE i < arr_len DO
      INSERT INTO metalrates
        (effectiveDate, session, purityCode, ratePerGram, source, setByUserId)
      VALUES
        (p_effectiveDate,
         p_session,
         JSON_UNQUOTE(JSON_EXTRACT(p_rates, CONCAT('$[', i, '].purityCode'))),
         JSON_EXTRACT(p_rates, CONCAT('$[', i, '].ratePerGram')),
         COALESCE(p_source, 'manual'),
         p_setByUserId)
      ON DUPLICATE KEY UPDATE
         ratePerGram = VALUES(ratePerGram),
         source      = VALUES(source),
         setByUserId = VALUES(setByUserId);
      SET i = i + 1;
    END WHILE;

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_setByUserId, 'save_metal_rates', 'metalrates',
            CONCAT(p_effectiveDate, '/', p_session), p_rates);
  COMMIT;

  CALL get_current_metal_rates();
END$$
DELIMITER ;
