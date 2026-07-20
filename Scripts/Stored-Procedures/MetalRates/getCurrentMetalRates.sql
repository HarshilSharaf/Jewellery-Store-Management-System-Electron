DROP procedure IF EXISTS `get_current_metal_rates`;
DELIMITER $$
CREATE PROCEDURE `get_current_metal_rates`()
BEGIN
  SELECT
    r.id,
    r.effectiveDate,
    r.session,
    r.purityCode,
    p.label       AS purityLabel,
    p.metalType,
    r.ratePerGram,
    r.source,
    r.setByUserId,
    r.createdAt
  FROM metalrates r
  INNER JOIN purities p ON r.purityCode = p.code
  INNER JOIN (
    SELECT purityCode, MAX(CONCAT(effectiveDate, ' ',
                                  CASE session WHEN 'PM' THEN '2' ELSE '1' END)) AS ordKey
      FROM metalrates
     GROUP BY purityCode
  ) latest
    ON latest.purityCode = r.purityCode
   AND CONCAT(r.effectiveDate, ' ',
              CASE r.session WHEN 'PM' THEN '2' ELSE '1' END) = latest.ordKey
  ORDER BY p.sortOrder;
END$$
DELIMITER ;
