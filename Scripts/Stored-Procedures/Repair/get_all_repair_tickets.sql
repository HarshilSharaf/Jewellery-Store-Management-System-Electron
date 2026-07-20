DROP procedure IF EXISTS `get_all_repair_tickets`;
DELIMITER $$
CREATE PROCEDURE `get_all_repair_tickets`(
  IN p_status         VARCHAR(20),
  IN p_customerSearch VARCHAR(120),
  IN p_dateFrom       DATE,
  IN p_dateTo         DATE,
  IN p_pageSize       INT,
  IN p_page           INT
)
BEGIN
  DECLARE l_limit  INT DEFAULT 20;
  DECLARE l_offset INT DEFAULT 0;
  DECLARE l_search VARCHAR(122);

  SET time_zone = 'SYSTEM';
  SET l_limit  = GREATEST(1, COALESCE(p_pageSize, 20));
  SET l_offset = GREATEST(0, (COALESCE(p_page, 1) - 1) * l_limit);
  SET l_search = CASE
    WHEN p_customerSearch IS NULL OR p_customerSearch = '' THEN NULL
    ELSE CONCAT('%', p_customerSearch, '%')
  END;

  SELECT
    t.id,
    t.ticketGuid,
    t.ticketNumber,
    t.customerId,
    c.customerGuid,
    CONCAT_WS(' ', c.firstName, c.lastName) AS customerName,
    c.phoneNumber                            AS customerPhone,
    t.receivedAt,
    t.itemDescription,
    t.weight,
    t.estimatedCharge,
    t.estimatedReturnDate,
    t.status,
    t.actualCharge,
    t.deliveredAt,
    t.karigarId,
    k.name                                   AS karigarName,
    t.createdAt
  FROM repairtickets t
  JOIN customers c    ON c.id = t.customerId
  LEFT JOIN karigars k ON k.id = t.karigarId
  WHERE t.deletedAt IS NULL
    AND (p_status   IS NULL OR p_status   = '' OR t.status = p_status)
    AND (l_search   IS NULL OR CONCAT_WS(' ', c.firstName, c.lastName) LIKE l_search
                            OR c.phoneNumber LIKE l_search
                            OR t.ticketNumber LIKE l_search)
    AND (p_dateFrom IS NULL OR DATE(t.receivedAt) >= p_dateFrom)
    AND (p_dateTo   IS NULL OR DATE(t.receivedAt) <= p_dateTo)
  ORDER BY t.receivedAt DESC, t.id DESC
  LIMIT l_limit OFFSET l_offset;

  SELECT COUNT(*) AS totalRecords
  FROM repairtickets t
  JOIN customers c ON c.id = t.customerId
  WHERE t.deletedAt IS NULL
    AND (p_status   IS NULL OR p_status   = '' OR t.status = p_status)
    AND (l_search   IS NULL OR CONCAT_WS(' ', c.firstName, c.lastName) LIKE l_search
                            OR c.phoneNumber LIKE l_search
                            OR t.ticketNumber LIKE l_search)
    AND (p_dateFrom IS NULL OR DATE(t.receivedAt) >= p_dateFrom)
    AND (p_dateTo   IS NULL OR DATE(t.receivedAt) <= p_dateTo);
END$$
DELIMITER ;
