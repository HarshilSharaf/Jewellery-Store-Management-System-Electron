# Seed data

`Scripts/Seed/seed-data.sql` populates every table with a small, coherent set of
rows so a new install boots into a demo state. The container init script runs
it automatically; on a manual install you run it as the last step.

## What gets inserted

| Table                 | Rows | Notes                                                          |
| --------------------- | ---- | -------------------------------------------------------------- |
| `users`               | 3    | `admin`, `manager`, `cashier` - all share password `admin123`. |
| `customers`           | 10   | Real-looking Indian names spread across metros.                |
| `mastercategories`    | 4    | Gold, Silver, Diamond, Platinum.                               |
| `productcategories`   | 6    | Necklace, Ring, Earring, Bracelet, Pendant, Anklet.            |
| `subcategories`       | 5    | Traditional, Modern, Antique, Bridal, Daily Wear.              |
| `products`            | 30   | Six of them flagged `isSold = 1` to back the sample invoices.  |
| `invoices`            | 6    | One per sold product, spread across the last six months.       |
| `invoice_products_mappings` | 6 | One line item per invoice (single-product orders).           |
| `payments`            | 6    | Includes cash / cheque / online mixes; one is a partial payment (invoice `isPaymentDone = 0`). |

## Default user credentials

| Username  | Password   | Role       |
| --------- | ---------- | ---------- |
| `admin`   | `admin123` | `admin`    |
| `manager` | `admin123` | `manager`  |
| `cashier` | `admin123` | `employee` |

The stored hash is a bcrypt(10) of the plaintext:

```
$2a$10$aeAxxnSaN5dOiPhW.g8AEep46P4lm0KtiOpe8Lv/TVxHjn0BYm//u
```

Rotate these before shipping to a real shop -
see [`../security/default-credentials.md`](../security/default-credentials.md).

## How to reseed

The safest way is to wipe the database and let the init script rerun. See
[`../runbooks/reset-database.md`](../runbooks/reset-database.md).

If you just want to re-run the seed on top of the existing schema (say, after
manually clearing rows), execute the file directly:

```bash
mysql -u root -p jewellery < Scripts/Seed/seed-data.sql
```

**Warning:** the seed does not use `INSERT ... ON DUPLICATE KEY UPDATE`. Re-running
against a populated database will fail on the unique keys (`users_email`,
`users_user_name`, `customers_email`, and the GUID unique indexes added by V001).
You must clear the relevant tables first.

## Notes for developers

- Customer, product, invoice, and payment GUIDs are generated at seed time via
  `UUID()` - they differ on every reseed, which means the app never has a stable
  seed identifier to rely on. Tests that need a stable GUID must fetch it after
  seeding, not hard-code it.
- Invoice `createdAt` timestamps are hard-coded to specific dates in
  `2025-11` through `2026-03` so the six-month revenue chart on the dashboard
  looks non-empty in demos. Bump those dates if you are running this seed years
  after 2026 - otherwise the last-six-months window will be empty.
- The seed does not populate `users.imagePath`, `customers.imagePath`, or
  `products.imagePath`. Image records only appear once the user uploads through
  the UI.
