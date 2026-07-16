# Quick start (manual MySQL)

Use this path if you already have a MySQL 8.0 server on `localhost` and don't want
another Docker container running. For the recommended container-based flow, see
[`quick-start-docker.md`](./quick-start-docker.md).

## 1. Clone (with submodule)

```bash
git clone --recurse-submodules https://github.com/HarshilSharaf/Jewellery-Store-Management-System-Electron
cd Jewellery-Store-Management-System-Electron
```

## 2. Create the database and application user

Connect as `root` (or any user with `CREATE DATABASE` privileges) and run:

```sql
CREATE DATABASE jewellery
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER 'zeus_user'@'%' IDENTIFIED BY 'zeus@123';
GRANT EXECUTE ON jewellery.* TO 'zeus_user'@'%';
FLUSH PRIVILEGES;
```

You may change credentials; just remember them for step 5.

## 3. Load tables, migrations, procedures, seed

From the repo root, run the SQL files **in order**:

```bash
# 1. Tables
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

# 2. Migrations (schema tweaks / indexes added post-baseline)
for f in Scripts/Migrations/*.sql; do
  mysql -uroot -p jewellery < "$f"
done

# 3. Stored procedures (recursive)
find Scripts/Stored-Procedures -name '*.sql' | sort | while read -r f; do
  mysql -uroot -p jewellery < "$f"
done

# 4. Seed data
mysql -uroot -p jewellery < Scripts/Seed/seed-data.sql
```

On Windows / cmd, use the loop pattern from the previous README (`for %S in (*.sql) do
mysql ... < %S`) - the semantics are the same.

## 4. Install Node dependencies

```bash
npm install
```

## 5. Configure the connection

Create `.env` at the repo root with the credentials you used above. Example:

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=jewellery
MYSQL_USER=zeus_user
MYSQL_PASSWORD=zeus@123
```

The `.env` file feeds two consumers:

- The Docker compose file (unused on this path).
- The Electron main process, which forwards the initial values to
  `electron-store`'s `defaultDbInfo`.

You can also edit the connection later from the in-app **Settings** page - see
[`runbooks/change-db-connection.md`](../runbooks/change-db-connection.md).

## 6. Run the app

Two terminals:

```bash
# terminal 1
npm start

# terminal 2 (once ng serve is listening)
npm run electron
```

Log in with a seeded user. See [`first-run.md`](./first-run.md).
