DROP procedure IF EXISTS `get_all_orders`;
DELIMITER $$
CREATE PROCEDURE `get_all_orders`(
  IN itemsPerPage INT,
  IN pageNumber INT,
  IN searchQuery VARCHAR(255)
)
BEGIN
  DECLARE startIndex INT;
  DECLARE searchPattern VARCHAR(255);

  SET searchPattern = CONCAT('%', searchQuery, '%');
  SET startIndex = (pageNumber - 1) * itemsPerPage;

  SELECT
    COUNT(A.id) AS totalRecords
  FROM invoices A
  INNER JOIN customers B ON A.soldToCustomer = B.id
  WHERE
    (A.invoiceNumber LIKE searchPattern
     OR B.firstName LIKE searchPattern
     OR B.lastName LIKE searchPattern
     OR B.phoneNumber LIKE searchPattern
     OR A.grandTotal LIKE searchPattern);

  SELECT
    A.id,
    A.invoiceGuid,
    A.invoiceNumber,
    A.hsn,
    A.placeOfSupply,
    A.subTotalTaxable,
    A.totalCgst,
    A.totalSgst,
    A.totalIgst,
    A.totalDiscount,
    A.totalMakingCharge,
    A.totalStoneCharge,
    A.totalWastageCharge,
    A.oldGoldCreditAmount,
    A.roundOffAmount,
    A.grandTotal,
    A.isPaymentDone,
    A.remarks,
    A.createdAt,
    A.updatedAt,
    A.cancelledAt,
    A.cancelReason,
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'lineType', li.lineType,
          'description', li.description,
          'productId', li.productId,
          'productGuid', p.productGuid,
          'sku', p.sku,
          'huid', p.huid,
          'purityCode', li.purityCode,
          'netWeight', li.netWeight,
          'ratePerGram', li.ratePerGram,
          'taxableAmount', li.taxableAmount,
          'lineTotal', li.lineTotal,
          'masterCategory', m.masterCategoryName,
          'subCategory', s.subCategoryName,
          'productCategory', pc.productCategoryName
        )
      )
      FROM invoicelineitems li
      LEFT JOIN products p ON li.productId = p.id
      LEFT JOIN mastercategories m ON p.mid = m.id
      LEFT JOIN subcategories s ON p.sid = s.id
      LEFT JOIN productcategories pc ON p.pid = pc.id
      WHERE li.invoiceId = A.id
    ) AS lineItems,
    (
      SELECT JSON_OBJECT(
        'customerId', cu.id,
        'customerGuid', cu.customerGuid,
        'firstName', cu.firstName,
        'lastName', cu.lastName,
        'gender', cu.gender,
        'city', cu.city,
        'phoneNumber', cu.phoneNumber
      )
      FROM customers cu
      WHERE cu.id = A.soldToCustomer
    ) AS customerDetails,
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'amount', pay.amount,
          'paymentType', pay.paymentType,
          'refNumber', pay.refNumber,
          'remarks', pay.remarks,
          'receivedOn', pay.receivedOn
        )
      )
      FROM payments pay
      WHERE pay.invoiceId = A.id
    ) AS payments
  FROM invoices A
  INNER JOIN customers B ON A.soldToCustomer = B.id
  WHERE
    (A.invoiceNumber LIKE searchPattern
     OR B.firstName LIKE searchPattern
     OR B.lastName LIKE searchPattern
     OR B.phoneNumber LIKE searchPattern
     OR A.grandTotal LIKE searchPattern)
  ORDER BY A.createdAt DESC
  LIMIT itemsPerPage OFFSET startIndex;
END$$
DELIMITER ;
