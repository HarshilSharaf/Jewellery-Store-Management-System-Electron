DROP procedure IF EXISTS `get_customer_details`;
DELIMITER $$
CREATE PROCEDURE `get_customer_details`(
  IN p_customerGuid CHAR(36)
)
BEGIN
  SELECT
    id,
    customerGuid,
    firstName,
    lastName,
    dateOfBirth,
    gender,
    address,
    city,
    state,
    stateCode,
    email,
    phoneNumber,
    gstin,
    pan,
    remarks,
    creditBalance
  FROM customers
  WHERE customerGuid = p_customerGuid
    AND deletedAt IS NULL;
END$$
DELIMITER ;
