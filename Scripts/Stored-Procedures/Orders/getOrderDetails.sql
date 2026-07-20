DROP procedure IF EXISTS `get_order_details`;
DELIMITER $$
CREATE PROCEDURE `get_order_details`(
  IN orderGuid CHAR(36)
)
BEGIN
  SELECT
      A.id,
      A.invoiceGuid,
      A.invoiceNumber,
      A.hsn,
      A.placeOfSupply,
      A.rateSnapshot,
      A.createdAt AS orderDate,
      A.isPaymentDone,
      A.remarks,
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
      A.updatedAt,
      A.cancelledAt,
      A.cancelReason,
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', li.id,
          'lineType', li.lineType,
          'description', li.description,
          'productId', li.productId,
          'productGuid', p.productGuid,
          'sku', p.sku,
          'huid', p.huid,
          'hsnCode', li.hsnCode,
          'purityCode', li.purityCode,
          'grossWeight', li.grossWeight,
          'netWeight', li.netWeight,
          'stoneWeight', li.stoneWeight,
          'ratePerGram', li.ratePerGram,
          'metalValue', li.metalValue,
          'makingCharge', li.makingCharge,
          'stoneCharge', li.stoneCharge,
          'wastageCharge', li.wastageCharge,
          'discountAmount', li.discountAmount,
          'taxableAmount', li.taxableAmount,
          'cgst', li.cgst,
          'sgst', li.sgst,
          'igst', li.igst,
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
        'imagePath', cu.imagePath,
        'firstName', cu.firstName,
        'lastName', cu.lastName,
        'gender', cu.gender,
        'city', cu.city,
        'state', cu.state,
        'gstin', cu.gstin,
        'pan', cu.pan,
        'phoneNumber', cu.phoneNumber,
        'email', cu.email
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
          'receivedOn', pay.receivedOn,
          'reconciledAt', pay.reconciledAt
        )
      )
      FROM payments pay
      WHERE pay.invoiceId = A.id
    ) AS payments,
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'receiptGuid', og.receiptGuid,
          'grossWeight', og.grossWeight,
          'testedPurityCode', og.testedPurityCode,
          'testedPurityPercent', og.testedPurityPercent,
          'deductionPercent', og.deductionPercent,
          'ratePerGram', og.ratePerGram,
          'creditAmount', og.creditAmount,
          'remarks', og.remarks
        )
      )
      FROM oldgoldreceipts og
      WHERE og.invoiceId = A.id
    ) AS oldGoldReceipts
  FROM invoices A
  WHERE A.invoiceGuid = orderGuid;
END$$
DELIMITER ;
