DROP procedure IF EXISTS `get_metal_rates_history`;
DELIMITER $$
CREATE PROCEDURE `get_metal_rates_history`(
  IN p_days INT
)
BEGIN
  DECLARE l_days INT;

  SET time_zone = 'SYSTEM';
  SET l_days = GREATEST(1, COALESCE(p_days, 30));

  SELECT
    m.id,
    m.effectiveDate,
    m.session,
    m.purityCode,
    p.label AS purityLabel,
    p.metalType,
    m.ratePerGram,
    m.source,
    m.setByUserId,
    u.userName AS setByUserName,
    m.createdAt
  FROM metalrates m
  JOIN purities p ON p.code = m.purityCode
  LEFT JOIN users u ON u.uid = m.setByUserId
  WHERE m.effectiveDate >= DATE_SUB(CURDATE(), INTERVAL l_days DAY)
  ORDER BY m.effectiveDate DESC, m.session DESC, p.sortOrder ASC;
END$$
DELIMITER ;
