DROP procedure IF EXISTS `get_all_karigars`;
DELIMITER $$
CREATE PROCEDURE `get_all_karigars`(
  IN p_itemsPerPage INT,
  IN p_pageNumber   INT,
  IN p_searchQuery  VARCHAR(120)
)
BEGIN
  DECLARE l_offset INT DEFAULT 0;
  DECLARE l_limit INT DEFAULT 20;
  DECLARE l_search VARCHAR(120);

  SET time_zone = 'SYSTEM';
  SET l_limit  = GREATEST(1, COALESCE(p_itemsPerPage, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_pageNumber, 1) - 1) * l_limit);
  SET l_search = COALESCE(p_searchQuery, '');

  SELECT
    k.id,
    k.karigarGuid,
    k.name,
    k.phone,
    k.address,
    k.remarks,
    (SELECT COUNT(*) FROM karigarjobcards j WHERE j.karigarId = k.id AND j.deletedAt IS NULL) AS totalJobs,
    (SELECT COUNT(*) FROM karigarjobcards j WHERE j.karigarId = k.id AND j.status = 'issued'   AND j.deletedAt IS NULL) AS openJobs,
    k.createdAt,
    k.updatedAt
  FROM karigars k
  WHERE k.deletedAt IS NULL
    AND (l_search = '' OR k.name LIKE CONCAT('%', l_search, '%')
                       OR k.phone LIKE CONCAT('%', l_search, '%'))
  ORDER BY k.name ASC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM karigars k
  WHERE k.deletedAt IS NULL
    AND (l_search = '' OR k.name LIKE CONCAT('%', l_search, '%')
                       OR k.phone LIKE CONCAT('%', l_search, '%'));
END$$
DELIMITER ;
