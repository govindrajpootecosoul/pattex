# Pattex Dashboard – Project Overview

## Stack
- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT auth
- **Frontend**: React 18, Vite, React Router v6
- **Database**: MongoDB Atlas – **maindb** for users; **company DBs** (e.g. `pattex`, `emami`) for dashboard data on same cluster.

## Connection
- `backend/.env`: `MONGO_URI` must point to **maindb** (e.g. `...@cluster0.2ift0zy.mongodb.net/maindb`).
- Users are stored in `maindb` collection `userspattex_emami`. Each user has a **databaseName** (company) used for dashboard data from that DB.

## Auth
- **Signup**: name, email, phone, password (min 6 chars), **databaseName** (company DB name, e.g. pattex, emami). Password hashed with bcrypt. Stored in maindb.
- **Login**: email + password. Returns JWT (7-day expiry) and **databaseName**. Frontend stores user (including databaseName) and token.
- Dashboard requests use the user’s databaseName to load data from that company’s database (same collection names: revenues, inventories, marketings, buyboxes).
- Frontend shows the company/database name in the dashboard (sidebar badge).

## Dashboard Sections (static data for now)
1. **Executive Summary** – KPIs table + metrics (PO Received, Open PO, etc.)
2. **Revenue** – Filters, key data, highlight, detailed sales table
3. **Inventory** – Filters, key metrics, detailed inventory report table
4. **Buybox** – Coming soon (VC/S. Auction, Buybox, Top of search)
5. **Marketing** – Coming soon
6. **Product Details** – Coming soon (ASIN deep dive, last 30 days sales)

## Theme
- **Light theme** (Business Compass–style): white/light gray backgrounds, dark text, orange accent (`--accent: #f59e0b`). Variables in `frontend/src/index.css` (`:root`). Dashboard and Auth use these variables; hover/backdrop values in `Dashboard.css` and `Auth.css` are tuned for light backgrounds.

## Run
- Backend: `cd backend && npm install && npm run dev` → http://localhost:5000
- Frontend: `cd frontend && npm install && npm run dev` → http://localhost:3000 (proxies /api to backend)

## API
- `POST /api/auth/signup` – body: { name, email, phone, password, databaseName }
- `POST /api/auth/login` – body: { email, password }; response includes databaseName
- `GET /api/dashboard/*` – require Bearer token
  - `/api/dashboard/executive-summary`
  - `/api/dashboard/revenue`
  - `/api/dashboard/inventory`
  - `/api/dashboard/buybox`
  - `/api/dashboard/marketing`
  - `/api/dashboard/product-details`
