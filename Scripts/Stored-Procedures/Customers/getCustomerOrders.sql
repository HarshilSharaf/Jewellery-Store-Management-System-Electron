DROP procedure IF EXISTS `get_customer_orders`;
DELIMITER $$
CREATE PROCEDURE `get_customer_orders`(
  IN p_getCancelledOrders TINYINT(1),
  IN p_customerGuid       CHAR(36),
  IN itemsPerPage         INT,
  IN pageNumber           INT,
  IN searchQuery          VARCHAR(255)
)
BEGIN
  DECLARE startIndex INT;
  DECLARE l_customerID INT;
  DECLARE searchPattern VARCHAR(255);

  SET searchPattern = CONCAT('%', searchQuery, '%');
  SET startIndex = (pageNumber - 1) * itemsPerPage;
  SET l_customerID = (SELECT id FROM customers WHERE customerGuid = p_customerGuid);

  IF p_getCancelledOrders = 1 THEN
    SELECT COUNT(A.id) AS totalRecords
      FROM invoices A
     WHERE A.soldToCustomer = l_customerID
       AND (A.invoiceNumber LIKE searchPattern
            OR A.grandTotal LIKE searchPattern
            OR A.remarks LIKE searchPattern);

    SELECT
      A.id           AS orderId,
      A.invoiceGuid,
      A.invoiceNumber,
      (SELECT COUNT(*) FROM invoicelineitems B WHERE B.invoiceId = A.id) AS numberOfLineItems,
      A.grandTotal,
      A.createdAt AS orderDate,
      A.remarks,
      A.cancelledAt,
      A.cancelReason,
      A.isPaymentDone AS paymentStatus
    FROM invoices A
    WHERE A.soldToCustomer = l_customerID
      AND (A.invoiceNumber LIKE searchPattern
           OR A.grandTotal LIKE searchPattern
           OR A.remarks LIKE searchPattern)
    ORDER BY A.createdAt DESC
    LIMIT itemsPerPage OFFSET startIndex;
  ELSE
    SELECT COUNT(A.id) AS totalRecords
      FROM invoices A
     WHERE A.soldToCustomer = l_customerID
       AND A.cancelledAt IS NULL
       AND (A.invoiceNumber LIKE searchPattern
            OR A.grandTotal LIKE searchPattern
            OR A.remarks LIKE searchPattern);

    SELECT
      A.id           AS orderId,
      A.invoiceGuid,
      A.invoiceNumber,
      (SELECT COUNT(*) FROM invoicelineitems B WHERE B.invoiceId = A.id) AS numberOfLineItems,
      A.grandTotal,
      A.createdAt AS orderDate,
      A.remarks,
      A.cancelledAt,
      A.isPaymentDone AS paymentStatus
    FROM invoices A
    WHERE A.soldToCustomer = l_customerID
      AND A.cancelledAt IS NULL
      AND (A.invoiceNumber LIKE searchPattern
           OR A.grandTotal LIKE searchPattern
           OR A.remarks LIKE searchPattern)
    ORDER BY A.createdAt DESC
    LIMIT itemsPerPage OFFSET startIndex;
  END IF;
END$$
DELIMITER ;
