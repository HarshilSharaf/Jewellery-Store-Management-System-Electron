DROP procedure IF EXISTS `get_all_customers`;
DELIMITER $$
CREATE PROCEDURE `get_all_customers` (
  IN fetchImage    BOOLEAN,
  IN itemsPerPage  INT,
  IN pageNumber    INT,
  IN fetchAll      BOOLEAN,
  IN searchQuery   VARCHAR(255)
)
BEGIN
  DECLARE startIndex INT;
  DECLARE searchPattern VARCHAR(255);

  SET searchPattern = CONCAT('%', searchQuery, '%');
  SET startIndex = (pageNumber - 1) * itemsPerPage;

  IF fetchAll = 0 THEN
    SELECT COUNT(A.id) AS totalRecords
      FROM customers A
     WHERE A.deletedAt IS NULL
       AND (A.firstName LIKE searchPattern
            OR A.lastName LIKE searchPattern
            OR A.phoneNumber LIKE searchPattern
            OR A.email LIKE searchPattern
            OR A.gstin LIKE searchPattern);

    SELECT
      A.id,
      A.customerGuid,
      A.firstName,
      A.lastName,
      A.email,
      A.gender,
      A.city,
      A.state,
      A.stateCode,
      A.phoneNumber,
      A.gstin,
      A.pan,
      A.creditBalance,
      CASE WHEN fetchImage THEN A.imagePath ELSE NULL END AS imagePath
    FROM customers A
    WHERE A.deletedAt IS NULL
      AND (A.firstName LIKE searchPattern
           OR A.lastName LIKE searchPattern
           OR A.phoneNumber LIKE searchPattern
           OR A.email LIKE searchPattern
           OR A.gstin LIKE searchPattern)
    ORDER BY A.createdAt DESC
    LIMIT itemsPerPage OFFSET startIndex;
  ELSE
    SELECT
      A.id,
      A.customerGuid,
      A.firstName,
      A.lastName,
      A.email,
      A.gender,
      A.city,
      A.state,
      A.stateCode,
      A.phoneNumber,
      A.gstin,
      A.pan,
      A.creditBalance,
      CASE WHEN fetchImage THEN A.imagePath ELSE NULL END AS imagePath
    FROM customers A
    WHERE A.deletedAt IS NULL
      AND (A.firstName LIKE searchPattern
           OR A.lastName LIKE searchPattern
           OR A.phoneNumber LIKE searchPattern
           OR A.email LIKE searchPattern
           OR A.gstin LIKE searchPattern);
  END IF;
END$$
DELIMITER ;
