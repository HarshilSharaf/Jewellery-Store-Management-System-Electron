DROP procedure IF EXISTS `add_customer`;
DELIMITER $$
CREATE PROCEDURE `add_customer` (
  IN fName        TEXT,
  IN lName        TEXT,
  IN dob          DATE,
  IN gender       VARCHAR(6),
  IN address      TEXT,
  IN city         TEXT,
  IN state        TEXT,
  IN stateCode    VARCHAR(2),
  IN email        VARCHAR(255),
  IN phoneNumber  VARCHAR(20),
  IN gstin        VARCHAR(15),
  IN pan          VARCHAR(10),
  IN remarks      TEXT,
  IN imageFileName TEXT
)
BEGIN
  DECLARE l_customerGuid CHAR(36);
  DECLARE l_imageFileName TEXT DEFAULT NULL;

  SET l_customerGuid = UUID();

  IF imageFileName IS NOT NULL THEN
    SET l_imageFileName = CONCAT(l_customerGuid, '-customer-', imageFileName);
  END IF;

  SET time_zone = 'SYSTEM';
  INSERT INTO customers(
    customerGuid, firstName, lastName, dateOfBirth, gender,
    address, city, state, stateCode, email, phoneNumber,
    gstin, pan, remarks, imagePath, createdAt
  ) VALUES (
    l_customerGuid, fName, lName, dob, gender,
    address, city, state, stateCode, email, phoneNumber,
    gstin, pan, remarks, l_imageFileName, CURRENT_TIMESTAMP()
  );

  SELECT * FROM customers WHERE id = LAST_INSERT_ID();
END$$
DELIMITER ;
