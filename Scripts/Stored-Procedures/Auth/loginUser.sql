DROP procedure IF EXISTS `loginUser`;
DELIMITER $$
CREATE PROCEDURE `loginUser`(
  IN uName VARCHAR(255)
)
BEGIN
  SET time_zone = 'SYSTEM';
  IF EXISTS (SELECT 1 FROM users WHERE userName = uName) THEN
    UPDATE users
       SET last_login_date = CURRENT_TIMESTAMP(),
           lastLoginAt     = CURRENT_TIMESTAMP()
     WHERE userName = uName;

    SELECT
      uid,
      userName,
      email,
      type,
      permissions,
      password,
      lastLoginAt,
      last_login_date
    FROM users
    WHERE userName = uName;
  END IF;
END$$
DELIMITER ;
