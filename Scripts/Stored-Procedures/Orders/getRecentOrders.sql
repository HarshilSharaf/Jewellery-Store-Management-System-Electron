DROP procedure IF EXISTS `get_recent_orders`;
DELIMITER $$
CREATE PROCEDURE `get_recent_orders`(
  IN p_numberOfOrders INT
)
BEGIN
  SELECT
    A.id,
    A.invoiceGuid,
    A.invoiceNumber,
    A.grandTotal,
    A.isPaymentDone,
    A.createdAt,
    A.cancelledAt,
    (
      SELECT COUNT(*)
      FROM invoicelineitems li
      WHERE li.invoiceId = A.id
    ) AS totalLineItems,
    (
      SELECT JSON_OBJECT(
        'customerId', cu.id,
        'firstName', cu.firstName,
        'lastName', cu.lastName,
        'gender', cu.gender,
        'city', cu.city
      )
      FROM customers cu
      WHERE cu.id = A.soldToCustomer
    ) AS customerDetails
  FROM invoices A
  WHERE A.cancelledAt IS NULL
  ORDER BY A.createdAt DESC
  LIMIT p_numberOfOrders;
END$$
DELIMITER ;
