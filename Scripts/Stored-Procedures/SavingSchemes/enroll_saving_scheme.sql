DROP procedure IF EXISTS `enroll_saving_scheme`;
DELIMITER $$
CREATE PROCEDURE `enroll_saving_scheme`(
  IN p_customerGuid       CHAR(36),
  IN p_planName           VARCHAR(120),
  IN p_monthlyAmount      DECIMAL(12, 2),
  IN p_tenureMonths       SMALLINT,
  IN p_bonusInstallments  SMALLINT,
  IN p_actorUserId        INT
)
BEGIN
  DECLARE l_customerId INT DEFAULT NULL;
  DECLARE l_schemeGuid CHAR(36);
  DECLARE l_startDate DATE;
  DECLARE l_maturityDate DATE;
  DECLARE l_tenure SMALLINT;
  DECLARE l_bonus SMALLINT;
  DECLARE l_schemeId INT DEFAULT NULL;

  DECLARE error_code INT DEFAULT 0;
  DECLARE error_msg VARCHAR(255) DEFAULT '';
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    GET STACKED DIAGNOSTICS CONDITION 1 error_code = MYSQL_ERRNO, error_msg = MESSAGE_TEXT;
    RESIGNAL;
  END;

  SET time_zone = 'SYSTEM';

  SELECT id INTO l_customerId FROM customers WHERE customerGuid = p_customerGuid;
  IF l_customerId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'enroll_saving_scheme: customer not found';
  END IF;

  SET l_tenure = COALESCE(p_tenureMonths, 11);
  SET l_bonus = COALESCE(p_bonusInstallments, 1);
  SET l_startDate = CURDATE();
  SET l_maturityDate = DATE_ADD(l_startDate, INTERVAL l_tenure MONTH);
  SET l_schemeGuid = UUID();

  START TRANSACTION;
    INSERT INTO savingschemes
      (schemeGuid, customerId, planName, monthlyAmount, tenureMonths,
       bonusInstallments, startDate, expectedMaturityDate, totalPaid, status)
    VALUES
      (l_schemeGuid, l_customerId, p_planName, p_monthlyAmount, l_tenure,
       l_bonus, l_startDate, l_maturityDate, 0.00, 'active');

    SET l_schemeId = LAST_INSERT_ID();

    INSERT INTO auditlog (actorUserId, action, entity, entityId, after)
    VALUES (p_actorUserId, 'enroll_saving_scheme', 'savingschemes',
            CAST(l_schemeId AS CHAR),
            JSON_OBJECT('schemeGuid', l_schemeGuid, 'planName', p_planName,
                        'monthlyAmount', p_monthlyAmount, 'tenureMonths', l_tenure));
  COMMIT;

  SELECT l_schemeId AS schemeId, l_schemeGuid AS schemeGuid,
         l_startDate AS startDate, l_maturityDate AS expectedMaturityDate;
END$$
DELIMITER ;
