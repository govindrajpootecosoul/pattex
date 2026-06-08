# Business Requirements Document (BRD) — Pattex Dashboard

## 1) Background & Context
This project provides a web-based analytics dashboard for a company’s commerce performance (e.g., “Pattex”, “Emami”) across multiple sales channels. It is a multi-tenant application: each tenant/company’s operational datasets live in its own MongoDB database (e.g. `pattex`, `emami`), while users are stored centrally in a main database.

## 2) Core Business Problem
Business users need a single place to view and act on key commerce metrics (revenue, inventory health, buybox ownership, marketing performance) without manually consolidating exports/spreadsheets. The system solves:

- **Fragmented reporting**: data exists across multiple exports/sheets and needs normalization.
- **Slow decision cycles**: stakeholders need “as-of” updated metrics with drilldowns.
- **Multi-company separation**: different companies require isolated data views with shared application logic.

## 3) Goals (Business Outcomes)
- **Provide a unified performance dashboard** per company with repeatable KPIs and drilldowns.
- **Reduce manual reporting effort** by generating KPI cards, tables, and downloadable CSVs.
- **Enable controlled access** via authentication and company-level tenancy boundaries.
- **Support operational review cadence** by allowing date-period comparisons (day/week/month/year) where applicable.

## 4) In Scope (What the system delivers today)
Based on the current codebase:

- **Authentication & tenancy**
  - User signup/login using JWT.
  - Each user is associated with a `databaseName` (tenant/company database).
  - Admins can manage users for their own tenant (list/update/delete/create).

- **Dashboard modules**
  - **Executive Summary**: KPI cards and ASIN deep-dive (including CSV export).
  - **Revenue**: KPI totals, detailed table, comparisons, and CSV export (client-side).
  - **Inventory**: daily snapshot table, last-30 sales/units, CSV export (client-side).
  - **Buybox**: daily snapshot with “Amazon.ae” ownership, day-over-day comparison, CSV export (client-side).
  - **Marketing**: KPI + charts + SKU and campaign views, comparisons, and CSV export (client-side).
  - **Product Details**: placeholder (“Coming soon”).

- **Performance & reliability**
  - Server-side caching for heavy dashboard endpoints (Redis optional; safe to run without Redis).
  - Client-side request dedupe/caching for GET calls (React Query).

## 5) Out of Scope (Explicitly not delivered today)
- Payments, subscriptions, billing.
- Data ingestion pipelines / ETL (the system assumes datasets already exist in MongoDB collections).
- Role-based permissions beyond `user` vs `admin`.
- A fully implemented “Product Details” deep dive screen (currently a placeholder response).

## 6) Target Users
- **Business analysts / performance managers**: monitor revenue, marketing efficiency (ACoS/TACOS), and SKU performance.
- **Supply chain / inventory planners**: track availability, DOS, instock rate, and open POs.
- **Marketplace operations**: monitor buybox ownership (e.g., Amazon.ae vs others) and hijacker signals.
- **Company admins**: manage users within the same tenant database.

## 7) Value Proposition
- **Single source of truth per company**: tenancy ensures each company sees only its own data.
- **Faster insights**: ready-made KPI cards, comparisons, and searchable/filterable tables.
- **Operational exports**: CSV downloads for executive ASIN performance and detailed tables.
- **Resilient performance**: optional Redis caching plus client-side deduping keeps dashboards responsive.

## 8) Assumptions & Dependencies
- MongoDB cluster is reachable and has:
  - `maindb.userspattex_emami` for users
  - one database per tenant with collections such as `revenues`, `inventories`, `buyboxes`, `marketings`, `targets`
- Frontend is configured with `VITE_API_BASE_URL` pointing to the backend origin (backend mounts APIs under `/api`).
- Data fields in the tenant collections are semi-structured; backend normalizes/handles multiple possible key names.

## 9) Success Metrics (Business)
- **Adoption**: weekly active users per tenant.
- **Time saved**: reduced manual spreadsheet work for monthly/weekly reporting.
- **Decision speed**: faster identification of declining ASINs, low stock SKUs, and buybox gaps.
- **Reliability**: dashboard loads succeed even when Redis is unavailable (cache becomes a “miss”).

## 10) Future Scope (Scalability & Growth)
- **Tenancy scaling**
  - Add tenant provisioning workflows (create tenant DB, seed indexes, admin onboarding).
  - Add stricter tenant isolation policies and auditing.

- **Data pipelines**
  - Automated ingestion from Amazon/Vendor Central/Seller Central exports into MongoDB.
  - Data validation rules and schema versioning for semi-structured datasets.

- **Advanced analytics**
  - Alerting (email/Slack) on thresholds: buybox drops, DOS below target, TACOS spikes.
  - Forecasting and recommendations (inventory reorder points, bid/spend optimization).

- **Product Details deep dive**
  - Build the “coming soon” module into a fully functional ASIN detail page (images, trend charts, cohort views).

- **Security & governance**
  - Fine-grained roles/permissions (read-only, analyst, ops, admin).
  - SSO integration and stronger admin controls (password resets, invites).

