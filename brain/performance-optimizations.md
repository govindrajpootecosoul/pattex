# Performance & API optimizations (2026-06-08)

## Implemented (full list C)

### 1. Inventory & Buybox — no double fetch on open
- **Hook:** `frontend/src/hooks/useDatasetDateAnchor.js`
- Waits for shared sales channels + `latest-updated-date` before first data call
- **Before:** 2× inventory/buybox + 2× latest-updated-date
- **After:** 1× latest-updated-date + 1× data (+ buybox-last30 parallel)

### 2. Sales channels — load once per session
- **Context:** `frontend/src/context/SalesChannelsContext.jsx`
- Wrapped in `main.jsx` inside `AuthProvider`
- All sections use `useSalesChannels()` from shared cache (1 network call)

### 3. Executive Summary — 1 HTTP call
- **Backend:** `GET /api/dashboard/executive-summary-bundle`
- Returns: `{ executiveSummary, keyPerformanceMetrics, revenue, latestUpdatedDate, salesChannels }`
- **Frontend:** `ExecutiveSummary.jsx` uses `getExecutiveSummaryBundle()`
- **Before:** 5 parallel API calls after login
- **After:** 1 bundle call (+ sales channels already loaded at Dashboard level = often 1 total new call)

### 4. Marketing — 1 HTTP call
- **Backend:** `GET /api/dashboard/marketing-bundle`
- Returns: `{ primary, currentMonth, previousMonth, latestUpdatedDate }`
- **Frontend:** `Marketing.jsx` uses `getMarketingBundle()`

### 5. Auth middleware — user lookup cache
- **File:** `backend/middleware/auth.js`
- In-memory cache 5 min (`AUTH_USER_CACHE_TTL_MS`)
- Skips `User.findById` on repeat dashboard requests

### 6. Redis (production)
- Already supported; enable via `.env`:
  ```env
  REDIS_CACHE_ENABLED=true
  REDIS_URL=redis://...
  ```

### 7. MongoDB indexes
- Schema indexes in `backend/models/companyDb.js` (Date, Sales Channel, ASIN, etc.)
- Optional compound indexes: `ENSURE_COMPANY_INDEXES=true` + `COMPANY_DB_NAMES=pattex,emami`

## Expected API log after login (Executive Summary)

```
POST /api/auth/login
GET  /api/dashboard/sales-channels          (Dashboard mount, once)
GET  /api/dashboard/executive-summary-bundle (single bundle)
```

## Inventory first open

```
GET /api/dashboard/latest-updated-date?dataset=inventory&salesChannel=...
GET /api/dashboard/inventory?customRangeStart=...  (correct date, once)
```

## Marketing first open

```
GET /api/dashboard/marketing-bundle?...
```
