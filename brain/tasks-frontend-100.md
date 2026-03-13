# Pattex Frontend – 100 Tasks

Tasks for the React 18 + Vite + React Router frontend (dashboard, auth, theme).

---

## Auth & User (1–18)

1. Add client-side validation on Login: email format, password non-empty.
2. Add client-side validation on Signup: name, email, phone format, password strength (min 6, optional complexity).
3. Show clear error message when login fails (invalid credentials / network).
4. Show clear error message when signup fails (e.g. email already exists).
5. Disable submit button while auth request is in flight to prevent double submit.
6. Add “Show/hide password” toggle on Login and Signup.
7. Add “Forgot password?” link on Login that navigates to forgot-password flow (when backend supports it).
8. Redirect to intended URL after login (e.g. from /dashboard/revenue back to revenue after auth).
9. Persist “remember me” in localStorage and pass to API if backend supports it.
10. Show loading spinner or skeleton on auth loading (AuthContext) instead of plain “Loading...”.
11. Add logout confirmation modal (“Are you sure you want to log out?”).
12. Add session timeout warning (e.g. “Session expiring in 5 min”) and extend or logout.
13. Handle 401 globally (e.g. in api.js or axios interceptor): clear token, redirect to login, show message.
14. Add Profile page fields: display name, email (read-only), phone, change password (when backend has it).
15. Add “Resend verification email” on Signup success if email verification is implemented.
16. Add accessibility: aria-labels on auth form inputs and buttons, focus management on error.
17. Add rate limiting feedback: if backend returns 429, show “Too many attempts, try later.”
18. Add optional 2FA input and flow on Login when backend supports it.

---

## Dashboard Layout & Navigation (19–30)

19. Add keyboard shortcut to toggle sidebar (e.g. Ctrl+B or Cmd+B).
20. Persist sidebar open/closed state in localStorage so it survives refresh.
21. Add breadcrumbs on dashboard (e.g. Dashboard > Revenue).
22. Add “Back to top” button when user scrolls down long tables.
23. Add user menu in header: profile, settings, logout (if not already in sidebar).
24. Show current user name/avatar in header or sidebar.
25. Add responsive sidebar: collapse to icons-only on small screens, overlay on mobile.
26. Add active section indicator in sidebar (already using NavLink active; ensure visible).
27. Add keyboard navigation in sidebar (Tab, Enter to navigate).
28. Add “Product Details” to nav when backend provides real data (already in nav as coming soon).
29. Add notification bell or alerts area in header (placeholder or real).
30. Add global loading bar (e.g. top progress bar) when navigating or fetching dashboard data.

---

## Executive Summary (31–35)

31. Replace static KPIs with data from `GET /dashboard/executive-summary` if backend serves dynamic data.
32. Add date selector for executive summary when API supports it.
33. Add sparklines or mini charts for KPI trends (e.g. last 6 months).
34. Add export to CSV/PDF for executive summary table.
35. Add tooltips for metric definitions (e.g. “PO Received”, “SBU MTD Batch”).

---

## Revenue Section (36–45)

36. Add column visibility toggle (show/hide columns in Revenue table).
37. Add column sorting (click header to sort by revenue, units, AOV, etc.).
38. Add CSV export for Revenue table (current page or full data).
39. Add number formatting: locale-aware (e.g. 1,234.56) and currency symbol.
40. Show comparison period labels in UI (e.g. “vs previous month”).
41. Add empty state when no revenue data (illustration + message).
42. Add loading skeleton for Revenue table while data is fetching.
43. Add error state with retry button if Revenue API fails.
44. Add deep link support: /dashboard/revenue?date=current_month so shareable URLs work.
45. Add optional chart view for Revenue (e.g. revenue over time by channel).

---

## Inventory Section (46–52)

46. Add column visibility and sorting for Inventory table.
47. Add CSV export for Inventory.
48. Add filters UI: category, channel, stock status (connect to API when backend supports filters).
49. Add color coding for stock status (e.g. red for Critical, yellow for Low Stock).
50. Add empty and loading states for Inventory.
51. Add “Days of supply” warning indicator (e.g. highlight when DOS &lt; 7).
52. Add pagination controls if backend adds pagination (already have Pagination component).

---

## Buybox Section (53–58)

53. Replace “Coming soon” with real Buybox table when API returns rows (already implemented; verify UI).
54. Add filters and sorting for Buybox table.
55. Add CSV export for Buybox.
56. Add visual indicator for “has buybox” (e.g. badge or icon).
57. Add empty and loading states for Buybox.
58. Add date filter UI for Buybox consistent with Revenue/Inventory.

---

## Marketing Section (59–68)

59. Add loading skeletons for Marketing KPIs and charts.
60. Add error state and retry for Marketing API.
61. Add chart legend and axis labels (e.g. left: $, right: %).
62. Add tooltips on chart data points (date, values).
63. Add export chart as image (e.g. PNG) for Marketing combo chart.
64. Add column picker for “Other columns” in SKU table (if not already).
65. Add CSV export for Marketing SKU and Campaign tables.
66. Ensure campaign-level date range and filters are clearly separated from SKU-level.
67. Add empty state when no marketing data.
68. Add accessibility for charts (aria-label, role, or table alternative for key metrics).

---

## Product Details & Profile (69–74)

69. Replace Product Details “Coming soon” with real UI when backend has product-details API data.
70. Add ASIN deep dive view: single ASIN performance, last 30 days (when API exists).
71. Add Profile form: edit name, phone; change password (when backend has endpoints).
72. Add profile picture upload placeholder (or avatar initials).
73. Add “Delete account” with confirmation (when backend supports it).
74. Show “Last login” or “Member since” on Profile if API provides it.

---

## API & Data Layer (75–82)

75. Add request cancellation (AbortController) for dashboard API calls on component unmount or filter change.
76. Add client-side cache (e.g. React Query or SWR) for dashboard data with stale-while-revalidate.
77. Centralize API base URL (e.g. env VITE_API_URL) for different environments.
78. Add request timeout handling and show user-friendly message.
79. Retry failed requests (e.g. 1–2 retries with backoff) for GET dashboard.
80. Normalize error messages from API (e.g. map 500 to “Something went wrong. Try again.”).
81. Add TypeScript or JSDoc types for API response shapes (dashboard, auth).
82. Add interceptors or wrapper to attach token and handle 401 (already partial in api.js; ensure global).

---

## UX & Accessibility (83–90)

83. Add focus trap in modals (e.g. logout confirm, filters).
84. Add skip link “Skip to main content” for keyboard users.
85. Ensure all interactive elements are focusable and have visible focus ring.
86. Add aria-live region for success/error toasts so screen readers announce them.
87. Ensure color contrast meets WCAG AA for text and buttons.
88. Add reduced-motion preference support (e.g. disable animations in CSS).
89. Add page title per route (e.g. “Revenue – Pattex Dashboard” via react-helmet or document.title).
90. Add meta description for login/signup for SEO (optional).

---

## Performance & Code Quality (91–97)

91. Lazy load dashboard section components (React.lazy + Suspense) for smaller initial bundle.
92. Memoize expensive computations in dashboard sections (e.g. useMemo for filtered/sorted tables).
93. Virtualize long tables (e.g. react-window or tanstack-virtual) for 1000+ rows.
94. Add React error boundary for dashboard so one section error doesn’t crash whole app.
95. Add unit tests for auth context (login, logout, token persistence).
96. Add unit tests for API helpers (request with token, error handling).
97. Add E2E test for login → dashboard → one section (e.g. Playwright or Cypress).

---

## Theme & UI Polish (98–100)

98. Add dark theme toggle and persist in localStorage (variables in index.css).
99. Add high-contrast theme option for accessibility.
100. Add print stylesheet: hide sidebar/nav, show only main content and tables for printing.

---

*Generated for Pattex frontend. Update this file as tasks are completed or new ones are added.*
