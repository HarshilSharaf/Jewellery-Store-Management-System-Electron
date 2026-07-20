DROP procedure IF EXISTS `save_shop_settings`;
DELIMITER $$
CREATE PROCEDURE `save_shop_settings`(
  IN p_shopName              VARCHAR(150),
  IN p_gstin                 VARCHAR(15),
  IN p_pan                   VARCHAR(10),
  IN p_addressLine1          VARCHAR(255),
  IN p_addressLine2          VARCHAR(255),
  IN p_city                  VARCHAR(80),
  IN p_state                 VARCHAR(80),
  IN p_stateCode             VARCHAR(2),
  IN p_pincode               VARCHAR(10),
  IN p_phone                 VARCHAR(20),
  IN p_email                 VARCHAR(120),
  IN p_logoPath              VARCHAR(255),
  IN p_invoicePrefix         VARCHAR(20),
  IN p_invoiceStartFrom      INT,
  IN p_currentInvoiceCounter INT,
  IN p_defaultCurrency       VARCHAR(3),
  IN p_timezone              VARCHAR(64),
  IN p_roundOffEnabled       TINYINT(1),
  IN p_backupDir             VARCHAR(255),
  IN p_defaultPrintVariant   VARCHAR(20),
  IN p_typographyPreset      VARCHAR(32),
  IN p_actorUserId           INT
)
BEGIN
  DECLARE l_actor_type VARCHAR(50) DEFAULT NULL;

  SET time_zone = 'SYSTEM';

  IF p_actorUserId IS NOT NULL THEN
    SELECT `type` INTO l_actor_type FROM users WHERE uid = p_actorUserId;
    IF l_actor_type IS NOT NULL AND l_actor_type = 'employee' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Forbidden: canEditShopSettings';
    END IF;
  END IF;

  INSERT INTO shopsettings
    (id, shopName, gstin, pan, addressLine1, addressLine2, city, state, stateCode,
     pincode, phone, email, logoPath, invoicePrefix, invoiceStartFrom,
     currentInvoiceCounter, defaultCurrency, timezone, roundOffEnabled,
     backupDir, defaultPrintVariant, typographyPreset)
  VALUES
    (1, p_shopName, p_gstin, p_pan, p_addressLine1, p_addressLine2, p_city,
     p_state, p_stateCode, p_pincode, p_phone, p_email, p_logoPath,
     COALESCE(p_invoicePrefix, 'INV/'),
     COALESCE(p_invoiceStartFrom, 1),
     COALESCE(p_currentInvoiceCounter, 1),
     COALESCE(p_defaultCurrency, 'INR'),
     COALESCE(p_timezone, 'Asia/Kolkata'),
     COALESCE(p_roundOffEnabled, 1),
     p_backupDir,
     COALESCE(p_defaultPrintVariant, 'a4'),
     COALESCE(p_typographyPreset, 'editorial'))
  ON DUPLICATE KEY UPDATE
    shopName              = VALUES(shopName),
    gstin                 = VALUES(gstin),
    pan                   = VALUES(pan),
    addressLine1          = VALUES(addressLine1),
    addressLine2          = VALUES(addressLine2),
    city                  = VALUES(city),
    state                 = VALUES(state),
    stateCode             = VALUES(stateCode),
    pincode               = VALUES(pincode),
    phone                 = VALUES(phone),
    email                 = VALUES(email),
    logoPath              = VALUES(logoPath),
    invoicePrefix         = VALUES(invoicePrefix),
    invoiceStartFrom      = VALUES(invoiceStartFrom),
    currentInvoiceCounter = VALUES(currentInvoiceCounter),
    defaultCurrency       = VALUES(defaultCurrency),
    timezone              = VALUES(timezone),
    roundOffEnabled       = VALUES(roundOffEnabled),
    backupDir             = VALUES(backupDir),
    defaultPrintVariant   = VALUES(defaultPrintVariant),
    typographyPreset      = VALUES(typographyPreset);

  SELECT * FROM shopsettings WHERE id = 1;
END$$
DELIMITER ;
