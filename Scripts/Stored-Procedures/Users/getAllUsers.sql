DROP procedure IF EXISTS `get_all_users`;
DELIMITER $$
CREATE PROCEDURE `get_all_users`()
BEGIN
  SET time_zone = 'SYSTEM';

  SELECT
    uid,
    userName,
    email,
    `type`,
    permissions,
    imagePath,
    created_on,
    lastLoginAt,
    last_login_date
  FROM users
  ORDER BY uid ASC;
END$$
DELIMITER ;
