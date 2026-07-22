DROP procedure IF EXISTS `get_ibja_snapshots`;
DELIMITER $$
CREATE PROCEDURE `get_ibja_snapshots`(
  IN p_status   VARCHAR(20),
  IN p_dateFrom DATE,
  IN p_dateTo   DATE,
  IN p_pageSize INT,
  IN p_page     INT
)
BEGIN
  DECLARE l_limit  INT DEFAULT 20;
  DECLARE l_offset INT DEFAULT 0;

  SET time_zone = 'SYSTEM';
  SET l_limit  = GREATEST(1, COALESCE(p_pageSize, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_page, 1) - 1) * l_limit);

  SELECT
    s.id,
    s.snapshotGuid,
    s.fetchedAt,
    s.session,
    s.status,
    s.errorMessage,
    LEFT(s.rawResponse, 500) AS rawResponsePreview,
    s.parsedRates,
    s.createdAt
  FROM ibjaratesnapshots s
  WHERE (p_status   IS NULL OR p_status = '' OR s.status = p_status)
    AND (p_dateFrom IS NULL OR DATE(s.fetchedAt) >= p_dateFrom)
    AND (p_dateTo   IS NULL OR DATE(s.fetchedAt) <= p_dateTo)
  ORDER BY s.fetchedAt DESC, s.id DESC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM ibjaratesnapshots s
  WHERE (p_status   IS NULL OR p_status = '' OR s.status = p_status)
    AND (p_dateFrom IS NULL OR DATE(s.fetchedAt) >= p_dateFrom)
    AND (p_dateTo   IS NULL OR DATE(s.fetchedAt) <= p_dateTo);
END$$
DELIMITER ;
