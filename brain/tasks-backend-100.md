# Pattex Backend – 100 Tasks

Tasks for the Node.js/Express/MongoDB backend (JWT auth, dashboard API).

---

## Auth & Users (1–20)

1. Add request validation for signup (e.g. express-validator): name length, email format, phone format, password strength.
2. Add request validation for login: email format, password non-empty.
3. Add rate limiting on `/api/auth/login` to prevent brute force.
4. Add rate limiting on `/api/auth/signup` to prevent abuse.
5. Implement refresh token flow (short-lived access token + refresh token).
6. Add endpoint `GET /api/auth/me` to return current user profile (protected).
7. Add endpoint `PATCH /api/auth/me` to update name, phone (password change separate).
8. Add endpoint `POST /api/auth/change-password` (current password + new password).
9. Add “forgot password” flow: request reset email, token, reset endpoint.
10. Store JWT secret in env; add validation that `JWT_SECRET` is set at startup.
11. Add optional “remember me” with longer token expiry (e.g. 30 days).
12. Add user role field to User model (e.g. admin, viewer) and use in auth.
13. Add last login timestamp and IP to User model; update on login.
14. Add email verification (send link on signup, verify token endpoint).
15. Add phone verification (optional OTP).
16. Sanitize and trim all string inputs in auth routes.
17. Return consistent error shape `{ message, code? }` from auth routes.
18. Add logout blacklist (store invalidated token IDs in Redis or DB) for “logout everywhere”.
19. Add audit log for auth events (login success/fail, signup, password change).
20. Add optional 2FA (TOTP) for user model and login flow.

---

## Dashboard API & Data (21–45)

21. Replace static executive summary with DB-backed model and CRUD or seed script.
22. Add pagination to `GET /dashboard/revenue` (query params: page, limit).
23. Add pagination to `GET /dashboard/inventory`.
24. Add pagination to `GET /dashboard/buybox`.
25. Add pagination to Marketing SKU rows and campaign rows in `GET /dashboard/marketing`.
26. Add server-side filtering for Revenue (e.g. by ASIN, product name, sales channel).
27. Add server-side filtering for Inventory (e.g. category, channel, stock status).
28. Add server-side filtering for Buybox (e.g. has buybox, channel).
29. Add sorting support for Revenue table (sort by revenue, units, date, etc.).
30. Add sorting support for Inventory and Buybox tables.
31. Add `GET /dashboard/product-details` that returns real data from a ProductDetails (or similar) collection.
32. Create ProductDetails model and seed data for “Product Details” section.
33. Add date range validation for custom range (start <= end, max range e.g. 1 year).
34. Add indexes on Revenue collection for Date, ASIN, Sales Channel for faster queries.
35. Add indexes on Inventory and Marketing/Buybox collections for common filters.
36. Return `X-Total-Count` or total in response for paginated endpoints.
37. Add caching (e.g. in-memory or Redis) for executive summary with short TTL.
38. Add optional field selection for dashboard responses (e.g. ?fields=rows,comparison).
39. Add API versioning (e.g. /api/v1/dashboard).
40. Add request ID middleware and include in logs and error responses.
41. Add health check that verifies MongoDB connection (e.g. /api/health with db status).
42. Add endpoint to return list of available date filter types and labels for frontend.
43. Support timezone in date filters (e.g. query param or user preference).
44. Add aggregation pipeline for Revenue to compute totals in DB instead of in-memory.
45. Add aggregation pipeline for Marketing chart data for large datasets.

---

## Models & Database (46–60)

46. Add Mongoose schema validation for Revenue model (required fields, types).
47. Add Mongoose schema validation for Inventory, Marketing, Buybox models.
48. Add soft delete for User (deletedAt) instead of hard delete.
49. Create ExecutiveSummary model/schema if moving from static data.
50. Add pre/post hooks for logging on critical model operations.
51. Add compound indexes for common dashboard query patterns.
52. Document all collection field names and types in /brain or README.
53. Add migration/seed script for sample Revenue, Inventory, Marketing, Buybox data.
54. Add data retention policy (e.g. delete records older than X months) script or job.
55. Use lean() consistently where no Mongoose methods needed (already used in routes).
56. Add connection retry logic in db.js with backoff.
57. Add read preference for reporting queries if using replica set (e.g. secondaryPreferred).
58. Add schema for ProductDetails (ASIN, last 30 days sales, etc.).
59. Validate ObjectId in any route that accepts id params.
60. Add database backup/export script or document backup procedure.

---

## Security & Middleware (61–75)

61. Add helmet middleware for security headers.
62. Sanitize all query params (e.g. prevent NoSQL injection in filter params).
63. Add CORS allowlist (specific origins) instead of `origin: true` in production.
64. Add request size limit (e.g. express.json limit) to prevent large payloads.
65. Validate Content-Type for POST/PATCH (e.g. application/json only).
66. Add middleware to log and block suspicious patterns (e.g. many 401s from same IP).
67. Use HTTP-only cookie for refresh token (if implementing refresh flow).
68. Add CSRF protection if using cookie-based auth.
69. Ensure no stack traces or internal errors in production API responses.
70. Add rate limiting globally (e.g. 100 req/min per IP) with higher limit for auth.
71. Add middleware to attach user role to req for protected routes.
72. Implement role-based access (e.g. only admin can access certain dashboard endpoints).
73. Add API key option for server-to-server dashboard access (optional).
74. Document security assumptions and env vars in README or /brain.
75. Run npm audit and fix or document known vulnerabilities.

---

## Error Handling & Logging (76–85)

76. Add global error handler middleware (4-arg) to catch unhandled errors.
77. Use a structured logger (e.g. pino, winston) instead of console.log.
78. Log request method, path, status, duration, and request ID.
79. Log errors with stack in development only.
80. Return consistent error response shape: `{ message, code?, requestId? }`.
81. Map Mongoose validation errors to 400 with readable messages.
82. Map JWT errors (expired, invalid) to 401 with clear message.
83. Add 404 handler for unknown routes (e.g. JSON `{ message: 'Not found' }`).
84. Add async handler wrapper to avoid try/catch in every route (e.g. express-async-handler).
85. Log MongoDB connection errors and reconnection events.

---

## Testing & Quality (86–92)

86. Add unit tests for auth routes (signup, login validation and success/fail).
87. Add unit tests for getPeriodMonths and aggregateRevenueRows (dashboard helpers).
88. Add integration tests for protected dashboard routes (with valid/invalid token).
89. Add integration test for MongoDB connection and a simple model save.
90. Add npm script for test (e.g. jest or vitest).
91. Add pre-commit or CI step to run tests and lint.
92. Add API contract tests (e.g. response shape for /dashboard/revenue, /marketing).

---

## Performance & DevOps (93–100)

93. Add compression middleware (e.g. gzip) for JSON responses.
94. Add ETag or Last-Modified for GET dashboard endpoints where applicable.
95. Document all environment variables in .env.example (no secrets).
96. Add Dockerfile for backend for consistent deployment.
97. Add docker-compose for backend + MongoDB for local dev.
98. Add graceful shutdown (close DB, stop accepting requests on SIGTERM).
99. Add optional request timeout middleware for long-running dashboard queries.
100. Add monitoring/APM placeholders (e.g. health, readiness endpoints for k8s).

---

*Generated for Pattex backend. Update this file as tasks are completed or new ones are added.*
