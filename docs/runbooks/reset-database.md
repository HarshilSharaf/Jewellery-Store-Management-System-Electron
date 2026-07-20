# Runbook: reset the database

You want to blow away all data and start clean - fresh schema, fresh seed.

## Docker path

The dockerized MySQL persists to the named volume `jewellery-db-data`. Wipe it,
then bring the stack back up:

```bash
docker compose down -v
docker compose up -d
docker compose logs -f mysql   # wait for '=== Database initialization complete ==='
```

The container init script re-runs from scratch: tables, migrations, stored
procedures, seed, grants.

Verify:

```bash
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  -e "SELECT COUNT(*) AS users FROM jewellery.users;" \
  -e "SELECT COUNT(*) AS customers FROM jewellery.customers;"
```

You should see 3 users and 10 customers.

## Manual MySQL path

If you're running MySQL natively, drop and recreate the database:

```sql
DROP DATABASE jewellery;
CREATE DATABASE jewellery
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
GRANT EXECUTE ON jewellery.* TO 'zeus_user'@'%';
FLUSH PRIVILEGES;
```

Then re-run tables + migrations + procedures + seed from the repo root:

```bash
# Tables
for f in Scripts/Tables/Users.sql \
         Scripts/Tables/Customers.sql \
         Scripts/Tables/MasterCategories.sql \
         Scripts/Tables/ProductCategories.sql \
         Scripts/Tables/SubCategories.sql \
         Scripts/Tables/Products.sql \
         Scripts/Tables/Invoices.sql \
         Scripts/Tables/Invoice_Products_Mapping.sql \
         Scripts/Tables/Payments.sql; do
  mysql -uroot -p jewellery < "$f"
done

# Migrations
for f in Scripts/Migrations/V*.sql; do
  # skip rollback files
  case "$f" in *__rollback.sql) continue;; esac
  mysql -uroot -p jewellery < "$f"
done

# Procs (recursive)
find Scripts/Stored-Procedures -name '*.sql' | sort | while read -r f; do
  mysql -uroot -p jewellery < "$f"
done

# Seed
mysql -uroot -p jewellery < Scripts/Seed/seed-data.sql
```

## Keeping the schema, wiping only the data

Truncate the tables in FK-safe order:

```sql
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE payments;
TRUNCATE TABLE invoice_products_mappings;
TRUNCATE TABLE invoices;
TRUNCATE TABLE products;
TRUNCATE TABLE customers;
TRUNCATE TABLE users;
TRUNCATE TABLE subcategories;
TRUNCATE TABLE productcategories;
TRUNCATE TABLE mastercategories;
SET FOREIGN_KEY_CHECKS = 1;
```

Then re-run `Scripts/Seed/seed-data.sql`.

## After a reset

- On the desktop side, delete any orphan image files under
  `Pictures/Jewellery-Store-Management-System/{customer,product,user}Images/` -
  they were referenced by the wiped rows and now dangle.
- If you were logged in when you reset, log out and back in - your `authData`
  in `electron-store` references a `uid` that no longer exists.

## Sanity checks

After reset, log in as `admin`/`admin123` and confirm:

- Dashboard shows non-zero revenue (the seeded invoices span the last 6 months
  relative to the seed's hard-coded dates - see
  [`../database/seed-data.md`](../database/seed-data.md)).
- Customers page lists 10 customers.
- Inventory page lists 30 products, 6 marked sold.
- Orders page lists 6 invoices.
