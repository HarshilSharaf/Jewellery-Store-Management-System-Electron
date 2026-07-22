DROP procedure IF EXISTS `save_ibja_snapshot`;
DELIMITER $$
CREATE PROCEDURE `save_ibja_snapshot`(
  IN p_session      VARCHAR(4),
  IN p_rawResponse  TEXT,
  IN p_status       VARCHAR(20),
  IN p_errorMessage VARCHAR(1000)
)
BEGIN
  DECLARE l_snapshotGuid CHAR(36);
  DECLARE l_snapshotId   INT DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  IF p_session NOT IN ('AM', 'PM') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'save_ibja_snapshot: session must be AM or PM';
  END IF;
  IF p_status NOT IN ('success', 'parse_failure', 'network_error') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'save_ibja_snapshot: invalid status';
  END IF;

  SET l_snapshotGuid = UUID();

  START TRANSACTION;
    INSERT INTO ibjaratesnapshots
      (snapshotGuid, session, rawResponse, status, errorMessage)
    VALUES
      (l_snapshotGuid, p_session, p_rawResponse, p_status, p_errorMessage);
    SET l_snapshotId = LAST_INSERT_ID();
  COMMIT;

  SELECT l_snapshotId AS snapshotId, l_snapshotGuid AS snapshotGuid;
END$$
DELIMITER ;
