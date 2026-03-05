# Pattex Dashboard – Project Overview

## Stack
- **Backend**: Node.js, Express, MongoDB (Mongoose), JWT auth
- **Frontend**: React 18, Vite, React Router v6
- **Database**: MongoDB Atlas – database name: `pattex`

## Connection
- MongoDB URI is in `backend/.env` as `MONGO_URI`
- Database name in connection string: `pattex` (created on first write)

## Auth
- **Signup**: name, email, phone, password (min 6 chars). Password hashed with bcrypt.
- **Login**: email + password. Returns JWT (7-day expiry).
- Frontend stores token in `localStorage` and sends `Authorization: Bearer <token>`.

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
- `POST /api/auth/signup` – body: { name, email, phone, password }
- `POST /api/auth/login` – body: { email, password }
- `GET /api/dashboard/*` – require Bearer token
  - `/api/dashboard/executive-summary`
  - `/api/dashboard/revenue`
  - `/api/dashboard/inventory`
  - `/api/dashboard/buybox`
  - `/api/dashboard/marketing`
  - `/api/dashboard/product-details`
