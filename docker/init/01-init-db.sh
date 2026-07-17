#!/bin/bash
set -e

SCRIPTS_DIR="/scripts"

echo "=== Creating tables ==="

TABLES=(
  "Users.sql"
  "Customers.sql"
  "MasterCategories.sql"
  "ProductCategories.sql"
  "SubCategories.sql"
  "Products.sql"
  "Invoices.sql"
  "Invoice_Products_Mapping.sql"
  "Payments.sql"
)

for file in "${TABLES[@]}"; do
  echo "Running Tables/$file ..."
  sed 's/\r$//' "$SCRIPTS_DIR/Tables/$file" | mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
done

# =============================================================================
# Run forward migrations in lexical order. Rollback scripts (V*__rollback.sql)
# are intentionally excluded — they are only executed manually. Migrations run
# AFTER tables but BEFORE stored procedures so that indexed columns exist
# before any proc references them, and so that seed data lands on the fully
# migrated schema.
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
