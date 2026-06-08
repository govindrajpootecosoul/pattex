# Functional Requirements Document (FRD) — Pattex Dashboard

## 1) System Overview
Pattex Dashboard is a multi-tenant web application with:

- **React (Vite) frontend** for authentication and dashboard UI
- **Node.js (Express) backend** providing REST APIs under `/api/*`
- **MongoDB (Mongoose)** for data storage
- **Optional Redis caching** for dashboard endpoints (safe to run with caching disabled)

Tenancy is implemented via `databaseName` on the user profile: the backend dynamically switches to the tenant/company database and queries collections within that database.

## 2) Technical Stack (as implemented)

### Frontend
- **Framework**: React 18
- **Build tool**: Vite 5
- **Routing**: `react-router-dom`
- **Data fetching**: native `fetch` wrapped in `frontend/src/api/api.js`
- **Client caching/deduping**: `@tanstack/react-query`
- **Charts**: `recharts`
- **Icons**: `lucide-react`
- **Dev server**: runs on port **3027** (`frontend/vite.config.js`)

### Backend
- **Runtime**: Node.js (ESM modules: `"type": "module"`)
- **Framework**: Express
- **Auth**: JWT (`jsonwebtoken`) + bcrypt password hashing (`bcryptjs`)
- **Compression**: `compression`
- **CORS**: `cors` (origin: true, credentials: true)
- **Database**: MongoDB via `mongoose`
- **Cache**: Redis via `ioredis` (optional, guarded by env flags)
- **API server**: listens on port **3026** (`backend/server.js`)

### Datastores
- **MongoDB cluster**:
  - `maindb` database for users (collection `userspattex_emami`)
  - One database per tenant/company (e.g. `pattex`, `emami`) with collections like `revenues`, `inventories`, `buyboxes`, `marketings`, `targets`

### Environment / Configuration
- **Backend** (`backend/.env` based on `.env.example`)
  - `MONGO_URI` (required)
  - `JWT_SECRET` (required)
  - Redis optional: `REDIS_URL`, `REDIS_CACHE_ENABLED=true`, `REDIS_DISABLED=true|false`
- **Frontend** (`frontend/.env` based on `.env.example`)
  - `VITE_API_BASE_URL` (required). If set to an origin like `http://localhost:3026`, the client normalizes it to include `/api`.

## 3) Functional Logic

### 3.1 Authentication & Authorization

#### Signup
- Frontend posts credentials and tenant database name to backend.
- Backend creates a user record in the central users collection and returns a JWT.

#### Login
- Frontend posts email + password.
- Backend validates password and checks `status === 'active'`.
- Backend returns JWT + user profile.

#### Session handling (frontend)
- JWT stored in `localStorage` as `pattex_token`.
- User object stored in `localStorage` as `pattex_user`.
- All API requests include `Authorization: Bearer <token>` when token exists.

#### Protecting routes (backend)
- All `/api/dashboard/*` endpoints are protected by middleware that:
  - verifies JWT
  - loads the `User` by id
  - rejects missing/invalid tokens

### 3.2 Multi-tenancy (company database selection)
- Each user has a required `databaseName` field (e.g. `pattex`, `emami`).
- For `/api/dashboard/*` requests, backend attaches `req.companyModels = getCompanyModels(req.user.databaseName)`.
- `getCompanyModels()` uses `mongoose.connection.useDb(databaseName)` so the same app instance can serve multiple tenants.

### 3.3 Frontend ↔ Backend Interaction Pattern

#### API client (`frontend/src/api/api.js`)
- Requires `VITE_API_BASE_URL`.
- GET requests are deduped/cached via React Query; non-GET requests bypass caching.
- Uses `cache: 'no-store'` to avoid browser cache issues when switching users.
- Handles network errors with a user-facing message.

#### Screens → API mapping
- **Login**: `POST /api/auth/login`
- **Signup**: `POST /api/auth/signup`
- **Logout**: `POST /api/auth/logout` (also clears client caches/storage)

Dashboard screens call `/api/dashboard/*`:
- **Executive Summary**: executive summary + KPI table + revenue deep-dive rows; supports CSV export
- **Revenue**: table rows + comparison payload; client filters further and exports CSV client-side
- **Inventory**: daily snapshot rows; “last 30 days sales” derived in API via revenue for the chosen date
- **Buybox**: daily snapshot rows + previous day rows; “last 30 days sales” fetched from a separate endpoint
- **Marketing**: KPI metrics + chart data + SKU/campaign views; comparisons supported
- **Product Details**: returns a “coming soon” payload

## 4) Database Schema (MongoDB)

> Note: Tenant datasets use **flexible schemas** (`strict: false`). Fields are semi-structured, and backend logic often supports multiple possible key names (e.g. `Date`, `date`, `DATE`, `Sales Channel` vs `sales_channel`).

### 4.1 Central users database (`maindb`)

#### Collection: `userspattex_emami`
Used for authentication + admin user management.

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | Yes | Trimmed |
| `email` | string | Yes | Unique, lowercased |
| `phone` | string | Yes | Trimmed |
| `password` | string | Yes | Hashed, min length 6, not selected by default |
| `databaseName` | string | Yes | Tenant/company DB name (e.g. `pattex`, `emami`) |
| `status` | enum | Yes | `active` (default) / `inactive` |
| `role` | enum | Yes | `user` (default) / `admin` |
| `createdAt`, `updatedAt` | date | Yes | Mongoose timestamps |

### 4.2 Tenant/company databases (one DB per company)

#### Collection: `revenues`
Common fields used by APIs/UI:
- **Identifiers / dimensions**: `ASIN`, `Product Name`, `Product Category`, `Pack Size`, `Sales Channel` (or variants)
- **Dates**: `Date` / `date` / `DATE`, optional `year_month`
- **Sales totals**: `total_sales`, `total_units`
- **Ads**: `ads_sales`, `ads_unit_sold` / ad units, ad spend-related fields (backend computes TACOS from spend/revenue when needed)
- Backend normalizes rows into a canonical response shape used by the UI:
  - `asin`, `productName`, `productCategory`, `packSize`, `salesChannel`
  - `overallUnit`, `overallRevenue`, `adUnit`, `adRevenue`, `organicUnit`, `organicRevenue`
  - `adSpend`, `aov`, `tacos`
  - `reportDate` (YYYY-MM-DD), `reportMonth` (YYYY-MM)

#### Collection: `inventories`
Common fields used by APIs/UI:
- `ASIN` / `asin`
- `Product Name` / `product_name`
- `Product Category` / `Product Sub Category` / `product_category` / `product_sub_category`
- `Pack Size` / `pack_size`
- `Sales Channel` / `sales_channel`
- `Available Inventory`
- `Instock Rate`
- `DOS`
- `Open POs`
- `OOS Date`
- `Stock_Status`
- `total_sales`, `total_units` (some datasets)

#### Collection: `buyboxes`
Common fields used by APIs/UI:
- `ASIN`, `Product Name`, `Product Category`, `Brand`, `Pack Size`, `Pack Type`
- `Sales Channel`
- `Date`
- `Current Owner` / buybox owner, `Current Owner Price`, ideal prices (`VC Ideal Price`, `SC Ideal Price`)
- Purchase order / inventory metrics: `Open POs`, `Available Inventory`, `Instock Rate`, `DOS`, `OOS Date`
- “Hijacker” columns: `Hijacker 1..10` (+ price, MOQ)
- Sales totals: `total_sales`, `total_units` (used for “last 30 days” views in UI; API also computes last-30 from revenues)

#### Collection: `marketings`
Common fields used by APIs/UI (SKU view + campaign view):
- `Date`, `Sales Channel`, `ASIN`, `Product Name`, `Product Category`, `Pack Size`
- Funnel & spend: `Impressions`, `Clicks`, `Ad Spend`, `Ad Unit Sold`, `Ad Sales`
- Totals: `Overall Unit Sold`, `Overall Revenue`
- Derived rates: `CTR`, `CPC`, `CVR`, `ACoS`, `TACOS` (backend and/or frontend recompute when needed)
- Campaign dimensions: `Campaign Name`, `Campaign Type`, `Portfolio name` (and related variants)

#### Collection: `targets`
Used by executive KPI logic (targets per month/channel).
Common fields referenced:
- `Year`, `Month`, `Sales Channel`

## 5) API Endpoints

Base URL:
- Backend: `http://localhost:3026`
- APIs mounted under: `/api`

Authentication:
- `/api/auth/*`

Dashboard (protected):
- `/api/dashboard/*` (requires `Authorization: Bearer <jwt>`)

### 5.1 Endpoint Table

| Route | Method | Auth | Purpose / Notes |
|---|---|---:|---|
| `/api/health` | GET | No | Health check; returns `{ ok: true, db: "pattex" }` |
| `/api/auth/signup` | POST | No | Create user with `{ name, email, phone, password, databaseName, role }`; returns JWT + profile |
| `/api/auth/login` | POST | No | Login with `{ email, password }`; returns JWT + profile (rejects inactive users) |
| `/api/auth/logout` | POST | Yes | Logout hook; invalidates server-side dashboard cache for the tenant |
| `/api/auth/users` | GET | Yes (admin) | List users for the same `databaseName` tenant |
| `/api/auth/users/:id` | PUT | Yes (admin) | Update user fields (name/email/phone/status) for same tenant |
| `/api/auth/users/:id` | DELETE | Yes (admin) | Delete user for same tenant |
| `/api/dashboard/latest-updated-date` | GET | Yes | Returns latest available date for a dataset. Query: `dataset=revenue|inventory|buybox|marketing`, optional `salesChannel` |
| `/api/dashboard/sales-channels` | GET | Yes | Returns distinct sales channels across datasets for dropdowns |
| `/api/dashboard/executive-summary` | GET | Yes | Executive Summary payload. Query: `salesChannel`, `dateFilterType`, `customRangeStart`, `customRangeEnd` |
| `/api/dashboard/key-performance-metrics` | GET | Yes | Executive KPI table payload (implemented as fixed “current month across all channels” semantics) |
| `/api/dashboard/revenue` | GET | Yes | Revenue dashboard payload. Query: `dateFilterType`, `customRangeStart`, `customRangeEnd`, `salesChannel`, `includePeriods=1`, optional `debug=1` |
| `/api/dashboard/executive-asin-performance-csv` | GET | Yes | CSV export derived from revenue deep-dive rows. Query: `deepDiveTab=declining|increasing|top_selling|traffic` plus revenue filters |
| `/api/dashboard/marketing` | GET | Yes | Marketing payload (KPIs + chart + SKU/campaign data). Query supports `dateFilterType`, `customRangeStart`, `customRangeEnd`, SKU filters (asin/name/category/pack/channel) and campaign filters (`campaignDateRange`, `campaignType`, `campaignName`, `campaignPortfolio`, `campaignSalesChannel`) |
| `/api/dashboard/inventory` | GET | Yes | Inventory snapshot payload. Query typically uses `customRangeStart/customRangeEnd` (date) and optional `salesChannel` |
| `/api/dashboard/buybox` | GET | Yes | Buybox snapshot payload. Query typically uses `customRangeStart/customRangeEnd` (date) and optional `salesChannel` (also returns `previousDayRows` for day-over-day UI) |
| `/api/dashboard/buybox-last30-sales` | GET | Yes | Computes last-30 sales/units by ASIN from `revenues`. Query: `customRangeStart`, `customRangeEnd`, optional `salesChannel` |
| `/api/dashboard/product-details` | GET | Yes | Returns a static “coming soon” payload |
| `/api/dashboard/` | GET | Yes | Returns a subset of static sections (executive summary + product details) |

## 6) Non-Functional Requirements (as implemented / implied)
- **Performance**
  - Response compression enabled on backend.
  - Redis caching supported but optional; failures degrade gracefully to “cache miss”.
  - Client GET deduping reduces duplicate calls during renders.
- **Security**
  - JWT-based auth; dashboard endpoints require token.
  - Admin-only operations for user management.
  - Tenant isolation via `databaseName`-based DB switching.
- **Reliability**
  - API returns user-friendly errors on network failures (frontend).
  - Backend includes “debug=1” modes for troubleshooting date formats in some endpoints.

