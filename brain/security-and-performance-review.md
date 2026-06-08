# Security & Performance Review (2026-06-08)

## Code structure

### Backend (`backend/`)
| Area | Path | Notes |
|------|------|-------|
| Entry | `server.js` | Express on port 3026, CORS, compression, `/api/auth` + protected `/api/dashboard` |
| Auth | `routes/authRoutes.js`, `middleware/auth.js`, `config/auth.js` | JWT login/signup; `protect` middleware on dashboard |
| Data | `routes/dashboardRoutes.js` | Heavy aggregation per tenant (`databaseName`) |
| Models | `models/User.js`, `models/*.js`, `models/companyDb.js` | User in maindb; company data in per-tenant DBs |
| Cache | `utils/cache.js` | Optional Redis (off unless `REDIS_CACHE_ENABLED=true` + `REDIS_URL`) |

### Frontend (`frontend/src/`)
| Area | Path | Notes |
|------|------|-------|
| API layer | `api/api.js` | Central fetch + React Query cache for GETs (5 min stale) |
| Auth | `context/AuthContext.jsx`, `utils/jwt.js` | Token in localStorage; 1-month session; auto-logout on expiry/401 |
| Pages | `pages/sections/*.jsx` | Each section loads its own dashboard endpoints |
| Shared | `hooks/useSalesChannels.js`, `queryClient.js` | Sales channel list cached via React Query |

Structure is clean and conventional. No unnecessary third-party analytics, tracking, or heavy runtime libraries on the server.

---

## Packages — server load & safety

### Backend dependencies (all lightweight, server-side only)
- **express**, **mongoose**, **jsonwebtoken**, **bcryptjs**, **cors**, **compression**, **dotenv** — standard stack; no hidden background jobs or telemetry.
- **ioredis** — only connects when explicitly enabled; fails fast with cooldown if Redis is down (API still works without cache).
- **npm audit**: fixed to **0 vulnerabilities** (2026-06-08).

### Frontend dependencies
- **react**, **react-router-dom**, **@tanstack/react-query** — core UI/data; no server impact.
- **recharts**, **lucide-react**, **react-datepicker** — client-only; affect bundle size, not backend load.
- **vite** / **esbuild** — dev tooling only; one moderate advisory affects the **dev server**, not production builds served statically.
- **npm audit**: react-router/postcss fixed; remaining esbuild/vite advisory is dev-only (upgrade to Vite 8 is a breaking change — defer until planned).

**Nothing in the dependency list phones home or adds continuous server load.**

---

## API call patterns (frontend)

### What is already good
- **Single API module** (`api/api.js`) — consistent auth headers, `cache: 'no-store'`, network error handling.
- **React Query on GETs** — dedupes identical requests, 5-minute stale cache, no refetch on window focus.
- **Cancellation** — React Query passes `AbortSignal` to fetch; sections use `cancelled` flags in effects.
- **Logout** — clears React Query cache and optional Redis tenant cache on server.

### Where load comes from (expected)
- **Executive Summary** — 4 parallel GETs on filter change (summary, KPIs, revenue periods, latest date). Different endpoints; parallel is correct. React Query caches repeat visits.
- **Marketing** — 3 parallel `getMarketing` calls (current filter + current month + previous month for funnel). Heavy on MongoDB; mitigated by backend Redis cache (5–10 min TTL) when enabled.
- **Each dashboard navigation** — section mounts and fetches; cached GETs return quickly on revisit within 5 minutes.

### Backend load note
- `protect` middleware runs **`User.findById` on every dashboard request**. For high traffic, consider caching user lookup in memory (short TTL) or embedding `databaseName` in JWT to skip DB read — not changed in this pass.

---

## Session / token (updated)

| Setting | Value |
|---------|--------|
| JWT expiry | **30 days** (`JWT_EXPIRES_IN=30d` in `backend/.env`) |
| Config | `backend/config/auth.js` |
| Client check | `frontend/src/utils/jwt.js` — decode `exp`, check on app load only (no polling) |
| API 401 | Auto-logout via `setUnauthorizedHandler` in `AuthContext` |
| Expired token message | `Session expired. Please sign in again.` (`code: TOKEN_EXPIRED`) |

Users must **log in again** after 30 days. Existing tokens issued with 7-day expiry remain valid until their original `exp`.

---

## Recommendations (future, optional)

1. Enable **Redis** in production (`REDIS_CACHE_ENABLED=true`, `REDIS_URL=...`) for dashboard aggregation cache.
2. Combine Marketing’s 3 calls into one backend endpoint with `{ current, currentMonth, previousMonth }` payload.
3. Upgrade **Vite 8** when ready for dev-server security patch (breaking change).
4. Add rate limiting on `/api/auth/login` if exposed publicly.
