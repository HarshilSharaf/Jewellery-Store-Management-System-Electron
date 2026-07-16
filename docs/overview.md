# Overview

## What this is

The Jewellery Store Management System is an offline-first desktop application for
running a small-to-medium jewellery retail business. It ships as a single Electron
binary that bundles an Angular 19 frontend and talks to a local MySQL database.

The application is designed to run on a single workstation (or a small LAN where the
MySQL server is on one machine and the Electron client on another). There is no cloud
component, no HTTP API server, and no external service dependency at runtime.

## What it does

The app covers the day-to-day workflow of a jewellery counter:

- **Customer management** - CRUD for customer records including contact details,
  address, gender, date of birth, and a profile photo. Soft-delete supported.
- **Inventory management** - CRUD for products classified by three category
  dimensions (master category = metal type, product category = jewellery type,
  sub-category = design style), with weight, description, and product photo.
  Products can be marked as sold; soft-delete supported.
- **Order / invoice creation** - A multi-step order builder that lets the user pick
  a customer, add products, compute per-line and per-invoice GST / discount /
  labour totals, and record a payment against the resulting invoice.
- **Payments** - Multiple partial payments (cash, cheque, online) can be recorded
  per invoice.
- **Dashboard** - Revenue chart (last six months), sales / labour split, top
  product categories, master-category stock breakdown, recent orders.
- **User management** - Multiple users with role tags (`admin`, `manager`,
  `employee`). Each user has a profile page with a photo.
- **Settings** - Runtime-editable database connection details (persisted via
  `electron-store`); triggers app relaunch to re-initialize the DB connection.

## Who uses it

- **Shop staff** at the counter creating orders and looking up customers.
- **Shop owner / manager** viewing revenue trends and stock levels.
- **One-off administrator** provisioning MySQL, seeding data, and configuring the
  connection on first run.

## Non-goals

- No multi-tenant hosting. Each install is a single-shop deployment.
- No REST / GraphQL API. All data access is direct MySQL over the LAN or `localhost`.
- No mobile client. Desktop only.
- No online sync, backup service, or SaaS control plane.

## Technology at a glance

| Layer          | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| Renderer       | Angular 19 (standalone components), Angular Material         |
| Desktop shell  | Electron 40                                                  |
| Local storage  | `electron-store` for auth + settings, filesystem for images  |
| Database       | MySQL 8.0                                                    |
| Auth           | Local password check with `bcryptjs`; session in `electron-store` |
| Logging        | `electron-log`                                               |
| Charts         | Chart.js 4                                                   |

See [`architecture/high-level.md`](./architecture/high-level.md) for how these pieces
fit together.
