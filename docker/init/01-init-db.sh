#!/bin/bash
set -e

SCRIPTS_DIR="/scripts"

echo "=== Creating tables ==="

# Dependency-safe order: parents before children. `mastercategories`,
# `productcategories`, `subcategories` and `purities` are referenced by
# `products`; `users` is referenced by `metalrates`/`auditlog`; `customers`
# and `invoices` are referenced by line items / payments / oldgold; the P2
# stubs come last because their FKs point back at the phase-1 core tables.
TABLES=(
  "ShopSettings.sql"
  "Purities.sql"
  "TaxSlabs.sql"
  "MasterCategories.sql"
  "ProductCategories.sql"
  "SubCategories.sql"
  "Users.sql"
  "Customers.sql"
  "Products.sql"
  "MetalRates.sql"
  "Invoices.sql"
  "InvoiceLineItems.sql"
  "Payments.sql"
  "OldGoldReceipts.sql"
  "AuditLog.sql"
  "SavingSchemes.sql"
  "SavingSchemeInstallments.sql"
  "Karigars.sql"
  "KarigarJobCards.sql"
  "KarigarLedger.sql"
  "StockMovements.sql"
  "RepairTickets.sql"
  "WhatsAppSendLog.sql"
  "IbjaRateSnapshots.sql"
)

for file in "${TABLES[@]}"; do
  echo "Running Tables/$file ..."
  sed 's/\r$//' "$SCRIPTS_DIR/Tables/$file" | mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
done

# =============================================================================
# Post-launch forward migrations. Empty during Phase 1 (destructive rebuild).
# See Scripts/Migrations/README.md for policy. Rollback files (V*__rollback.sql)
# are intentionally excluded — they are only executed manually.
# =============================================================================
if [ -d "$SCRIPTS_DIR/Migrations" ]; then
  echo "=== Applying migrations ==="
  find "$SCRIPTS_DIR/Migrations" -maxdepth 1 -type f -name "V*.sql" \
    ! -name "*__rollback.sql" \
    | sort | while read -r file; do
      echo "Running $file ..."
      sed 's/\r$//' "$file" | mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
    done
else
  echo "=== No Migrations directory found; skipping ==="
fi

echo "=== Creating stored procedures ==="

find "$SCRIPTS_DIR/Stored-Procedures" -name "*.sql" -type f | sort | while read -r file; do
  echo "Running $file ..."
  sed 's/\r$//' "$file" | sed 's/ DEFINER=`[^`]*`@`[^`]*`//' | mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
done

echo "=== Seeding dummy data ==="
sed 's/\r$//' "$SCRIPTS_DIR/Seed/seed-data.sql" | mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"

echo "=== Granting privileges to zeus_user ==="
mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" <<-EOSQL
  GRANT EXECUTE ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%';
  FLUSH PRIVILEGES;
EOSQL

echo "=== Database initialization complete ==="
