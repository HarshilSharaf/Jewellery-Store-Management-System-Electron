DROP procedure IF EXISTS `get_user_permissions`;
DELIMITER $$
CREATE PROCEDURE `get_user_permissions`(
  IN p_userId INT
)
BEGIN
  DECLARE l_type VARCHAR(50);
  DECLARE l_permissions JSON;
  DECLARE l_default JSON;

  SET time_zone = 'SYSTEM';

  SELECT `type`, `permissions` INTO l_type, l_permissions
    FROM users WHERE uid = p_userId LIMIT 1;

  IF l_type IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'get_user_permissions: user not found';
  END IF;

  IF l_type = 'admin' THEN
    SET l_default = JSON_OBJECT(
      'costsVisible', TRUE,
      'canCancelInvoice', TRUE,
      'canBackup', TRUE,
      'canDeleteCustomer', TRUE,
      'canDeleteProduct', TRUE,
      'canEditShopSettings', TRUE,
      'canManageUsers', TRUE,
      'canForfeitSavingScheme', TRUE
    );
  ELSEIF l_type = 'manager' THEN
    SET l_default = JSON_OBJECT(
      'costsVisible', TRUE,
      'canCancelInvoice', TRUE,
      'canBackup', FALSE,
      'canDeleteCustomer', TRUE,
      'canDeleteProduct', TRUE,
      'canEditShopSettings', TRUE,
      'canManageUsers', FALSE,
      'canForfeitSavingScheme', FALSE
    );
  ELSE
    SET l_default = JSON_OBJECT(
      'costsVisible', FALSE,
      'canCancelInvoice', FALSE,
      'canBackup', FALSE,
      'canDeleteCustomer', FALSE,
      'canDeleteProduct', FALSE,
      'canEditShopSettings', FALSE,
      'canManageUsers', FALSE,
      'canForfeitSavingScheme', FALSE
    );
  END IF;

  SELECT
    p_userId       AS userId,
    l_type         AS `type`,
    COALESCE(l_permissions, l_default) AS permissions,
    l_default      AS defaultPermissions;
END$$
DELIMITER ;
