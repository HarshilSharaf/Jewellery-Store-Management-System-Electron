# Stored procedures

Every database operation is implemented as a MySQL stored procedure under
`Scripts/Stored-Procedures/`. The Backend service layer in `Backend/**/` is a
thin wrapper that composes `CALL <proc>(?, ?, ...)` invocations. This document
is the exhaustive procedure reference, grouped by folder.

## Conventions

- Names are `snake_case`, tables camelCase.
- Every `IN` parameter starts with `p_` when defined recently; older ones use
  ad-hoc names (`fName`, `dob`, `pageNumber`, ...). Both are documented as-is.
- Procedures that page results consistently emit **two SELECT statements**: the
  first returns a single-row `totalRecords` scalar, the second returns the
  page. `DatabaseService.prepareResponseData` flattens these into one array
  where the caller reads `result[0].totalRecords` and iterates `result[1..]` as
  the page.
- Soft-delete filters are typically `WHERE deletedAt IS NULL` (or the OR/AND
  variant in older procs - watch out for precedence bugs; see the workstream
  findings).
- Procedures that write across multiple tables (`save_order`, `record_payment`)
  wrap the work in a `START TRANSACTION` + `EXIT HANDLER FOR SQLEXCEPTION` that
  `ROLLBACK`s on failure.

## Auth

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `loginUser` | `uName VARCHAR(255)` | Updates `users.last_login_date` and returns `uid, userName, email, type, password, last_login_date` for the row. Silent when the user does not exist. | [`Auth/loginUser.sql`](../../Scripts/Stored-Procedures/Auth/loginUser.sql) |

## Users

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `get_user_details` | `p_userId INT` | Returns full user row including `imagePath`. | [`Users/getUserDetails.sql`](../../Scripts/Stored-Procedures/Users/getUserDetails.sql) |
| `get_user_image` | `p_uid INT` | Returns just the `imagePath` column. | [`Users/getUserImage.sql`](../../Scripts/Stored-Procedures/Users/getUserImage.sql) |
| `update_user_details` | `p_userId INT, p_userName TEXT, p_password TEXT, p_email TEXT` | Updates the four editable fields. | [`Users/updateUserDetails.sql`](../../Scripts/Stored-Procedures/Users/updateUserDetails.sql) |
| `update_user_image` | `p_uid INT, p_imageFileName TEXT` | Writes new `imagePath`. | [`Users/updateUserImage.sql`](../../Scripts/Stored-Procedures/Users/updateUserImage.sql) |
| `delete_user_image` | `p_uid INT` | Sets `imagePath = NULL`. | [`Users/deleteUserImage.sql`](../../Scripts/Stored-Procedures/Users/deleteUserImage.sql) |

## Customers

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `add_customer` | `fName TEXT, lName TEXT, dob DATE, gender VARCHAR(6), address TEXT, city TEXT, email VARCHAR(255), phoneNumber BIGINT, imageFileName TEXT` | Inserts a new row and returns the generated `customerGuid`. Also stores the computed image filename if one is passed. | [`Customers/addCustomer.sql`](../../Scripts/Stored-Procedures/Customers/addCustomer.sql) |
| `update_customer_details` | `p_customerGuid CHAR(36), p_firstName TEXT, p_lastName TEXT, p_dateOfBirth DATE, p_address TEXT, p_city TEXT, p_email VARCHAR(255), p_phoneNumber BIGINT, p_gender VARCHAR(6)` | In-place update. | [`Customers/updateCustomerDetails.sql`](../../Scripts/Stored-Procedures/Customers/updateCustomerDetails.sql) |
| `update_customer_image` | `p_customerGuid CHAR(36), imageFileName TEXT` | Writes new `imagePath` computed as `<guid>-customer-<name>` and returns the old filename so the caller can delete it. | [`Customers/updateCustomerImage.sql`](../../Scripts/Stored-Procedures/Customers/updateCustomerImage.sql) |
| `delete_customer` | `p_hardDelete TINYINT(1), p_customerGuid CHAR(36)` | Hard-delete when flag is 1 else soft-delete via `deletedAt`. | [`Customers/deleteCustomer.sql`](../../Scripts/Stored-Procedures/Customers/deleteCustomer.sql) |
| `delete_customer_image` | `p_customerGuid CHAR(36)` | Nulls `imagePath` and returns the old value. | [`Customers/deleteCustomerImage.sql`](../../Scripts/Stored-Procedures/Customers/deleteCustomerImage.sql) |
| `get_all_customers` | `fetchImage BOOLEAN, itemsPerPage INT, pageNumber INT, fetchAll BOOLEAN, searchQuery VARCHAR(255)` | Paginated list with optional search on name / city / phone. Emits `totalRecords` then page rows. | [`Customers/getAllCustomers.sql`](../../Scripts/Stored-Procedures/Customers/getAllCustomers.sql) |
| `get_customer_details` | `p_customerGuid CHAR(36)` | Returns single customer row. | [`Customers/getCustomerDetails.sql`](../../Scripts/Stored-Procedures/Customers/getCustomerDetails.sql) |
| `get_customer_image` | `p_customerGuid CHAR(36)` | Returns `imagePath` only. | [`Customers/getCustomerImage.sql`](../../Scripts/Stored-Procedures/Customers/getCustomerImage.sql) |
| `get_customer_orders` | `p_getCancelledOrders TINYINT(1), p_customerGuid CHAR(36), itemsPerPage INT, pageNumber INT, searchQuery VARCHAR(255)` | Paginated list of a single customer's invoices, filterable by cancelled/active. | [`Customers/getCustomerOrders.sql`](../../Scripts/Stored-Procedures/Customers/getCustomerOrders.sql) |
| `get_total_amount_of_products_bought_for_customer` | `p_customerGuid CHAR(36)` | Sum of `totalAmountWithGst` across non-cancelled invoices. | [`Customers/getTotalAmountOfProductsBoughtForCustomer.sql`](../../Scripts/Stored-Procedures/Customers/getTotalAmountOfProductsBoughtForCustomer.sql) |
| `get_total_customers` | - | Scalar count of non-deleted customers. | [`Customers/getTotalCustomers.sql`](../../Scripts/Stored-Procedures/Customers/getTotalCustomers.sql) |

## Categories

### Master categories

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `add_master_category` | `p_masterCategoryName TEXT, p_masterCategoryDescription TEXT` | Insert. | [`Categories/MasterCategories/addMasterCategory.sql`](../../Scripts/Stored-Procedures/Categories/MasterCategories/addMasterCategory.sql) |
| `get_master_categories` | - | Returns all master categories. | [`Categories/MasterCategories/getMasterCategories.sql`](../../Scripts/Stored-Procedures/Categories/MasterCategories/getMasterCategories.sql) |

### Product categories

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `add_product_category` | `p_productCategoryName TEXT, p_productCategoryDescription TEXT` | Insert. | [`Categories/ProductCategories/addProductCategory.sql`](../../Scripts/Stored-Procedures/Categories/ProductCategories/addProductCategory.sql) |
| `get_product_categories` | - | Returns all product categories. | [`Categories/ProductCategories/getProductCategories.sql`](../../Scripts/Stored-Procedures/Categories/ProductCategories/getProductCategories.sql) |
| `get_top_product_categories` | `p_numberOfCategories INT` | Top-N product categories ordered by number of products sold. | [`Categories/ProductCategories/getTopProductCategories.sql`](../../Scripts/Stored-Procedures/Categories/ProductCategories/getTopProductCategories.sql) |

### Sub-categories

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `add_sub_category` | `p_subCategoryName TEXT, p_subCategoryDescription TEXT` | Insert. | [`Categories/SubCategories/addSubCategory.sql`](../../Scripts/Stored-Procedures/Categories/SubCategories/addSubCategory.sql) |
| `get_sub_categories` | - | Returns all sub-categories. | [`Categories/SubCategories/getSubCategories.sql`](../../Scripts/Stored-Procedures/Categories/SubCategories/getSubCategories.sql) |

### Aggregate

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `get_all_categories` | - | Returns all three category tables at once (used by product forms). | [`Categories/getAllCategories.sql`](../../Scripts/Stored-Procedures/Categories/getAllCategories.sql) |

## Inventory

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `add_product` | `p_productWeight DOUBLE, p_productDescription TEXT, p_productCategoryId INT, p_subCategoryId INT, p_masterCategoryId INT, p_imageFileName TEXT` | Inserts a new product with a fresh `productGuid`. | [`Inventory/addProduct.sql`](../../Scripts/Stored-Procedures/Inventory/addProduct.sql) |
| `update_product_details` | `p_productGuid CHAR(36), p_productDescription TEXT, p_productWeight DOUBLE, p_mid INT, p_sid INT, p_pid INT` | In-place update of non-image fields. | [`Inventory/updateProductDetails.sql`](../../Scripts/Stored-Procedures/Inventory/updateProductDetails.sql) |
| `update_product_image` | `p_productGuid CHAR(36), p_imageFileName TEXT` | Computes filename `<ts>-product-<guid>.<ext>`, writes it, returns old name. | [`Inventory/updateProductImage.sql`](../../Scripts/Stored-Procedures/Inventory/updateProductImage.sql) |
| `delete_product` | `p_hardDelete TINYINT(1), p_productGuid CHAR(36)` | Hard or soft delete. | [`Inventory/deleteProduct.sql`](../../Scripts/Stored-Procedures/Inventory/deleteProduct.sql) |
| `delete_product_image` | `p_productGuid CHAR(36)` | Nulls `imagePath` and returns the old value. | [`Inventory/deleteProductImage.sql`](../../Scripts/Stored-Procedures/Inventory/deleteProductImage.sql) |
| `get_all_products` | `p_fetchSoldProducts TINYINT(1), itemsPerPage INT, pageNumber INT, searchQuery VARCHAR(255)` | Paginated list, optional filter by sold flag. Emits `totalRecords` then page rows. | [`Inventory/getAllProducts.sql`](../../Scripts/Stored-Procedures/Inventory/getAllProducts.sql) |
| `get_product_details` | `p_productGuid CHAR(36)` | Single product with joined category names. | [`Inventory/getProductDetails.sql`](../../Scripts/Stored-Procedures/Inventory/getProductDetails.sql) |
| `get_product_image` | `p_productGuid CHAR(36)` | Returns `imagePath` only. | [`Inventory/getProductImage.sql`](../../Scripts/Stored-Procedures/Inventory/getProductImage.sql) |
| `get_total_stock` | - | Scalar count of unsold, non-deleted products. | [`Inventory/getTotalStock.sql`](../../Scripts/Stored-Procedures/Inventory/getTotalStock.sql) |
| `get_total_stock_of_master_category` | `p_categoryId INT` | Scalar count of unsold products in one master category. | [`Inventory/getTotalStockOfMasterCategory.sql`](../../Scripts/Stored-Procedures/Inventory/getTotalStockOfMasterCategory.sql) |

## Orders

| Procedure | Params | Description | File |
| --------- | ------ | ----------- | ---- |
| `save_order` | `p_totalAmountWithGst DOUBLE, p_totalAmountWithoutGstAndDiscount DOUBLE, p_totalDiscount DOUBLE, p_totalLabour DOUBLE, p_totalGst DOUBLE, p_remarks TEXT, p_soldToCustomer INT, p_amountPaid DOUBLE, p_paymentMethod VARCHAR(6), p_productsData JSON` | Transactional. Inserts an invoice, iterates the JSON `p_productsData` inserting `invoice_products_mappings` rows and flipping `products.isSold`, then optionally records a first payment. Rolls back on any failure. | [`Orders/saveOrder.sql`](../../Scripts/Stored-Procedures/Orders/saveOrder.sql) |
| `cancel_order` | `p_orderGuid CHAR(36)` | Sets `invoices.cancelledAt = NOW()`. | [`Orders/cancelOrder.sql`](../../Scripts/Stored-Procedures/Orders/cancelOrder.sql) |
| `record_payment` | `p_orderGuid CHAR(36), p_paymentType VARCHAR(6), p_remarks TEXT, p_paymentAmount DOUBLE, p_receivedOn DATE` | Transactional. Inserts a `payments` row, recomputes total received, flips `invoices.isPaymentDone = 1` when the sum meets the total. | [`Orders/recordPayment.sql`](../../Scripts/Stored-Procedures/Orders/recordPayment.sql) |
| `get_all_orders` | `itemsPerPage INT, pageNumber INT, searchQuery VARCHAR(255)` | Paginated list joining customer and payment aggregate. Emits `totalRecords` then rows. | [`Orders/getAllOrders.sql`](../../Scripts/Stored-Procedures/Orders/getAllOrders.sql) |
| `get_order_details` | `orderGuid CHAR(36)` | Returns the invoice, a JSON-aggregated array of line items with joined category names, a JSON object with customer details, and a JSON array of payments - all as a single row. Only returns non-cancelled invoices. | [`Orders/getOrderDetails.sql`](../../Scripts/Stored-Procedures/Orders/getOrderDetails.sql) |
| `get_recent_orders` | `p_numberOfOrders INT` | Newest N non-cancelled invoices; used by the dashboard. | [`Orders/getRecentOrders.sql`](../../Scripts/Stored-Procedures/Orders/getRecentOrders.sql) |
| `get_revenue_of_six_months` | - | Returns two rows: last-1-month revenue and last-6-months revenue, plus computed percent increase. Used by the dashboard revenue card. | [`Orders/getRevenueOfSixMonths.sql`](../../Scripts/Stored-Procedures/Orders/getRevenueOfSixMonths.sql) |
| `get_sales_labour` | `p_timeInterval INT` | Sum of sales and labour over the last N months. Used by the dashboard sales/labour split. | [`Orders/getSalesAndLabour.sql`](../../Scripts/Stored-Procedures/Orders/getSalesAndLabour.sql) |

## Known bugs

Discovered during Phase 4 discovery and intentionally left unpatched by the
Backend workstream (flagged for later):

- `add_customer` computes the customer GUID but returns it in a way callers
  cannot use; see the Backend workstream report.
- Older delete filters mix `OR` and `AND` with unintended precedence.
- `phoneNumber` is `VARCHAR(20)` in `customers` but `BIGINT` in the `add_customer`
  procedure signature - values with `+`, `-`, or spaces get coerced.
- `save_order` uses a `WHILE` loop over `JSON_LENGTH`; a `JSON_TABLE`
  rewrite is cleaner but was out of scope.

None of these prevent the app from running with the seeded data.
