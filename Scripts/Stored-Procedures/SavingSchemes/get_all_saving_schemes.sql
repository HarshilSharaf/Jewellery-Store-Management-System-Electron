DROP procedure IF EXISTS `get_all_saving_schemes`;
DELIMITER $$
CREATE PROCEDURE `get_all_saving_schemes`(
  IN p_itemsPerPage INT,
  IN p_pageNumber   INT,
  IN p_statusFilter VARCHAR(20),
  IN p_searchQuery  VARCHAR(120)
)
BEGIN
  DECLARE l_offset INT DEFAULT 0;
  DECLARE l_limit  INT DEFAULT 20;
  DECLARE l_search VARCHAR(120);

  SET time_zone = 'SYSTEM';
  SET l_limit = GREATEST(1, COALESCE(p_itemsPerPage, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_pageNumber, 1) - 1) * l_limit);
  SET l_search = COALESCE(p_searchQuery, '');

  SELECT
    s.id,
    s.schemeGuid,
    s.customerId,
    c.customerGuid,
    CONCAT(c.firstName, ' ', c.lastName) AS customerName,
    c.phoneNumber,
    s.planName,
    s.monthlyAmount,
    s.tenureMonths,
    s.bonusInstallments,
    s.startDate,
    s.expectedMaturityDate,
    s.totalPaid,
    s.status,
    s.redeemedAt,
    (SELECT COUNT(*) FROM savingschemeinstallments WHERE schemeId = s.id) AS installmentsPaid,
    s.createdAt
  FROM savingschemes s
  JOIN customers c ON c.id = s.customerId
  WHERE s.deletedAt IS NULL
    AND (p_statusFilter IS NULL OR p_statusFilter = '' OR s.status = p_statusFilter)
    AND (l_search = '' OR CONCAT(c.firstName, ' ', c.lastName) LIKE CONCAT('%', l_search, '%')
                       OR c.phoneNumber LIKE CONCAT('%', l_search, '%')
                       OR s.planName    LIKE CONCAT('%', l_search, '%'))
  ORDER BY s.createdAt DESC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM savingschemes s
  JOIN customers c ON c.id = s.customerId
  WHERE s.deletedAt IS NULL
    AND (p_statusFilter IS NULL OR p_statusFilter = '' OR s.status = p_statusFilter)
    AND (l_search = '' OR CONCAT(c.firstName, ' ', c.lastName) LIKE CONCAT('%', l_search, '%')
                       OR c.phoneNumber LIKE CONCAT('%', l_search, '%')
                       OR s.planName    LIKE CONCAT('%', l_search, '%'));
END$$
DELIMITER ;
