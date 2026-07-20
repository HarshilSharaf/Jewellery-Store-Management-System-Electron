DROP procedure IF EXISTS `update_customer_details`;
DELIMITER $$
CREATE PROCEDURE `update_customer_details` (
  IN p_customerGuid CHAR(36),
  IN p_firstName    TEXT,
  IN p_lastName     TEXT,
  IN p_dateOfBirth  DATE,
  IN p_address      TEXT,
  IN p_city         TEXT,
  IN p_state        TEXT,
  IN p_stateCode    VARCHAR(2),
  IN p_email        VARCHAR(255),
  IN p_phoneNumber  VARCHAR(20),
  IN p_gender       VARCHAR(6),
  IN p_gstin        VARCHAR(15),
  IN p_pan          VARCHAR(10),
  IN p_remarks      TEXT
)
BEGIN
  UPDATE customers
     SET firstName   = p_firstName,
         lastName    = p_lastName,
         dateOfBirth = p_dateOfBirth,
         address     = p_address,
         city        = p_city,
         state       = p_state,
         stateCode   = p_stateCode,
         email       = p_email,
         phoneNumber = p_phoneNumber,
         gender      = p_gender,
         gstin       = p_gstin,
         pan         = p_pan,
         remarks     = p_remarks
   WHERE customerGuid = p_customerGuid;
END$$
DELIMITER ;
