DROP procedure IF EXISTS `get_current_metal_rates`;
DELIMITER $$
CREATE PROCEDURE `get_current_metal_rates`()
BEGIN
  -- Return the most-recent AM row AND the most-recent PM row per purity.
  -- The settings UI shows both columns side-by-side; the cart-open path
  -- picks whichever session it needs on read.
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
    SELECT purityCode, session, MAX(effectiveDate) AS latestDate
      FROM metalrates
     GROUP BY purityCode, session
  ) latest
    ON latest.purityCode   = r.purityCode
   AND latest.session      = r.session
   AND latest.latestDate   = r.effectiveDate
  ORDER BY p.sortOrder, r.session;
END$$
DELIMITER ;
