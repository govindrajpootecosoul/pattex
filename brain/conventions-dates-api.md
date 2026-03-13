# Date format and API conventions

## Date format (project-wide)
- **Storage and API**: All dates use **YYYY-MM-DD** (ISO date string).
- **Backend**: `parseDateKey(value)` in `dashboardRoutes.js` normalizes any Date object or string to `YYYY-MM-DD`. Use it when reading `doc.Date` from MongoDB.
- **Frontend**: Date input `value` is always `YYYY-MM-DD`. Display can use `formatDateDisplay(ymdStr)` for readable format (e.g. `09 Mar 2026`).

## Buybox API (`GET /api/dashboard/buybox`)
- **Query params**: `customRangeStart`, `customRangeEnd` (optional). When provided, only rows with `reportDate` in that range are returned (default: single day when both same).
- **Response**: `rows` are filtered by selected date when params are sent. Each row has `reportDate` (YYYY-MM-DD) and `currentBuyboxOwner` (from DB: `Current Owner` / `Current Owner ` / `CurrentOwner` / `BuyBox`).
- **Metrics**: Overall Buybox %, Amazon.ae count, and No. of SKUs with no Buybox are computed from **unique ASINs**; owner is compared case-insensitively (e.g. `Amazon.ae` = `amazon.ae`).
