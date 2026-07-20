# Module map

Angular feature module -> Backend service (renderer) -> Stored procedure.
Everything here is the concrete wiring you can trace in the source tree.

## Top-level routing

`client/app/app-routing.config.ts` mounts three lazy-loaded top-level routes:

| Path         | Loads                                     | Guard      |
| ------------ | ----------------------------------------- | ---------- |
| `/`          | `modules/main/main-routing.config.ts`     | `AuthGuard` |
| `/login`     | `modules/login/login-routing.config.ts`   | -          |
| `/settings`  | `modules/settings/settings-routing.config.ts` | -          |

Inside `main-routing.config.ts` the child routes fan out to the feature modules
below.

## Login

- Component: `client/app/modules/login/components/login/login.component.ts`
- Renderer service: `client/app/shared/services/Auth/auth.service.ts`
- Backend: `Backend/Auth/auth.ts` -> `loginUser`
- Session store: `electron-store` key `authData`
- Details: [`auth-flow.md`](./auth-flow.md).

## Dashboard

- Component tree: `client/app/modules/dashboard/components/{main,bar-chart,pie-chart,recent-orders}`
- Backend services used:
  - `Backend/Orders/db-orders.service.ts` -> `get_revenue_of_six_months`,
    `get_sales_labour`, `get_recent_orders`
  - `Backend/Categories/ProductCategories/db-product-categories.service.ts` ->
    `get_top_product_categories`
  - `Backend/Inventory/db-inventory.service.ts` -> `get_total_stock`,
    `get_total_stock_of_master_category`
  - `Backend/Customers/db-customers.service.ts` -> `get_total_customers`

## Customers

- Component tree:
  `client/app/modules/customers/components/{customers-page,add-customer-form,view-details,image-upload}`
- Route-scoped service: `client/app/modules/customers/services/customer-data.service.ts`
- Backend service: `Backend/Customers/db-customers.service.ts`
- File service: `Backend/Shared/file-system.service.ts` (customerImagesDir)
- Procs used:
  - `add_customer`, `update_customer_details`, `update_customer_image`
  - `delete_customer`, `delete_customer_image`
  - `get_all_customers`, `get_customer_details`, `get_customer_image`
  - `get_customer_orders`, `get_total_amount_of_products_bought_for_customer`
  - `get_total_customers`

## Inventory

- Component tree:
  `client/app/modules/inventory/components/{inventory-page,available-products,product-details-form,view-product-details,product-image-upload}`
- Route-scoped service: `client/app/modules/inventory/services/inventory.service.ts`
- Backend service: `Backend/Inventory/db-inventory.service.ts`
- File service: `Backend/Shared/file-system.service.ts` (productImagesDir)
- Procs used:
  - `add_product`, `update_product_details`, `update_product_image`
  - `delete_product`, `delete_product_image`
  - `get_all_products`, `get_product_details`, `get_product_image`
  - `get_total_stock`, `get_total_stock_of_master_category`

## Orders

- Component tree:
  `client/app/modules/orders/components/{orders-page,prepare-order,order-details,order-products-details,order-payments,print-invoice}`
- Route-scoped service: `client/app/modules/orders/services/order.service.ts`
- Backend service: `Backend/Orders/db-orders.service.ts`
- Procs used:
  - `save_order` (JSON products array + payment)
  - `cancel_order`
  - `record_payment`
  - `get_all_orders`, `get_order_details`, `get_recent_orders`
  - `get_revenue_of_six_months`, `get_sales_labour`

## Categories

- Component tree: `client/app/modules/categories/components/*`
- Backend services:
  - `Backend/Categories/db-categories.service.ts` -> `get_all_categories`
  - `Backend/Categories/MasterCategories/db-master-categories.service.ts` ->
    `add_master_category`, `get_master_categories`
  - `Backend/Categories/ProductCategories/db-product-categories.service.ts` ->
    `add_product_category`, `get_product_categories`, `get_top_product_categories`
  - `Backend/Categories/SubCategories/db-sub-categories.service.ts` ->
    `add_sub_category`, `get_sub_categories`

## Profile

- Component tree: `client/app/modules/profile/components/*`
- Route-scoped service: `client/app/modules/profile/services/*`
- Backend service: `Backend/Users/db-user.service.ts`
- File service: `Backend/Shared/file-system.service.ts` (userImagesDir)
- Procs used:
  - `get_user_details`, `get_user_image`
  - `update_user_details`, `update_user_image`, `delete_user_image`

## Settings

- Component tree: `client/app/modules/settings/components/settings-page`
- Uses `Backend/Shared/store.service.ts` to read/write `currentDbInfo` and
  `defaultDbInfo`.
- Uses `Backend/Shared/database.service.ts` to test the new connection.
- No stored procedures involved.
- Details: [`../runbooks/change-db-connection.md`](../runbooks/change-db-connection.md).

## Shared / cross-cutting

- **`Backend/Shared/database.service.ts`** - MySQL pool wrapper +
  `prepareResponseData`.
- **`Backend/Shared/store.service.ts`** - `electron-store` wrapper.
- **`Backend/Shared/file-system.service.ts`** - image save/read/delete +
  compression via `ngx-image-compress`.
- **`Backend/Shared/logger.service.ts`** - `electron-log` wrapper. `LogInfo`
  and `LogError` both go to the same rotating log file.
- **`Backend/Shared/utitlity.service.ts`** - small helpers used across the
  Backend layer.
- **Renderer-only shared**: `client/app/shared/services/{cart,cart-side-bar,sidebar,global-error-handler}.service.ts`
  drive UI state (cart drawer, sidebar collapse, top-level error handler).
