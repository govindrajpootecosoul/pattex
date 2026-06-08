# Pattex — Filters, columns, and calculations (screen-wise)

Use this document to **present** how dashboards work and to **train an agent** on Pattex logic.

## Architecture (two layers)

| Layer | Where | What it does |
|--------|--------|----------------|
| **API / Mongo** | `backend/routes/dashboardRoutes.js` | Loads company DB (`revenues`, `inventories`, `marketings`, `buyboxes`). Applies **sales channel**, **date period** (and Marketing SKU filters). Returns normalized rows. |
| **UI** | `frontend/src/pages/sections/*.jsx` | Applies **search, ASIN, product, category, pack, channel**, **stock/buybox chips**, **Top 10 views**. Often **merges rows by ASIN** again for tables/KPIs. |

**Rule of thumb:** Date + sales channel usually narrow data on the server. Product-level filters and “Top 10” rankings almost always run **in the browser** on already-fetched rows.

---

## Global concepts

### Date filter types (`dateFilterType`)

| Value | Meaning | Period key on row |
|--------|---------|-------------------|
| `CURRENT_DAY` / `PREVIOUS_DAY` | Single calendar day vs previous day | `reportDate` (YYYY-MM-DD) |
| `CURRENT_WEEK` / `PREVIOUS_WEEK` | 7-day window | `reportDate` |
| `CURRENT_MONTH` / `PREVIOUS_MONTH` | One calendar month | `reportMonth` (YYYY-MM) |
| `CURRENT_YEAR` / `PREVIOUS_YEAR` | 12 months | `reportMonth` |
| `CUSTOM_RANGE` | User-selected month range | `reportMonth` |

- **T-3 lag:** “Current” month/day/week is anchored to **today minus 3 days** (data lag), unless a **channel-specific latest date** is used (Revenue/Marketing anchor to max `Date` in DB for selected sales channel).
- **Comparison period:** Always the period **before** current (e.g. current month → previous month). Implemented in `getPeriodMonths()` / `getPeriodDaysOrWeeks()` in `dashboardRoutes.js` and mirrored in `Revenue.jsx`.

### Sales channel

- Query param: `salesChannel` (Executive, Revenue, Inventory, Buybox, Marketing top section).
- Marketing campaigns: separate `campaignSalesChannel`.
- Mongo: `buildSalesChannelOrFilter()` matches many field name variants (`Sales Channel`, `sales_channel`, etc.).
- Default UI channel: **Seller Central** when available.

### ASIN merge (one row per product)

When multiple DB rows share the same ASIN (e.g. duplicate lines or “All channels” view):

| Screen | Function | Sum | Average |
|--------|----------|-----|---------|
| Revenue | `mergeRevenueRowsByAsin` | units, revenues, ad spend | AOV, TACOS % per row then averaged |
| Executive deep dive | `aggByAsin` | `overallRevenue`, `overallUnit` | — |
| Inventory | `mergeInventoryRowsByAsin` | available, 30D sales, open POs | DOS, instock % |
| Buybox | `mergeBuyboxRowsByAsin` | sales, units, inventory amounts | DOS, rates, ideal prices; **last row wins** for Current Owner |
| Marketing SKU | `mergeMarketingSkuRowsByAsin` | impressions, clicks, spend, sales | DOS; **recomputes** CTR, CPC, CVR, ACoS, TACoS |

### Percent change

```text
pctChange(current, previous) = ((current - previous) / previous) * 100
```

- If `previous === 0` and `current > 0` → UI shows **"New"** (not a %).
- If both zero → **0%**.

---

## MongoDB → API field map (Revenue collection)

Backend maps each `revenues` document in `GET /dashboard/revenue` (see ~line 1659 in `dashboardRoutes.js`):

| API field | Mongo / source columns | Calculation |
|-----------|------------------------|-------------|
| `overallUnit` | `total_units` | `parseNum` |
| `overallRevenue` | `total_sales` | `parseNum` |
| `adUnit` | `ads_unit_sold` | `parseNum` |
| `adRevenue` | `ads_sales` | `parseNum` |
| `organicUnit` | — | `max(0, total_units - ads_unit_sold)` |
| `organicRevenue` | `organic_sale` | `parseNum` |
| `aov` | — | `total_sales / total_units` if units > 0 |
| `tacos` | `ads_spend`, `total_sales` | `(ads_spend / total_sales) * 100` |
| `adSpend` | `ads_spend` | `parseNum` |
| `reportDate` | `Date` / `date` / `DATE` | `parseDateKey` → YYYY-MM-DD |
| `reportMonth` | date or `year_month` | normalized YYYY-MM |
| `asin` | ASIN variants | `revenueAsinFromDoc` |
| `productName` | product name fields | `revenueProductNameFromDoc` |
| `salesChannel` | channel fields | `revenueChannelFromDoc` |
| `productCategory` | category / subcategory fields | first non-empty |
| `packSize` | pack size fields | string |

With `includePeriods=1`, API also returns `currentRows` and `comparisonRows` filtered by period sets.

---

## Screen 1 — Executive Summary

**Files:** `ExecutiveSummary.jsx`, `executiveAsinDeepDive.js`, APIs: `/executive-summary`, `/key-performance-metrics`, `/revenue?includePeriods=1`

### Filters

| Filter | Scope | Logic |
|--------|--------|--------|
| Sales channel | API + table | `salesChannel` query; table filters merged rows where channel matches (case/space normalized). |
| Date | API | `dateFilterType`; Emami users only `CURRENT_MONTH` / `PREVIOUS_MONTH`. |
| Search (ASIN / name) | UI only | Substring match on `asin` or `productName`. |

### Deep dive tabs (“Top” / performance lists)

All use **current vs comparison** revenue rows from API, aggregated **per ASIN** (`overallRevenue`, `overallUnit` summed).

| Tab ID | Label | Filter | Sort | Limit |
|--------|-------|--------|------|-------|
| `top_selling` | Top selling ASINs | `currentRevenue > 0` | `currentRevenue` DESC | **10** |
| `declining` | Declining revenue | `currentRevenue < previousRevenue` | `absDiffRevenue` ASC (worst drop first) | all (paginated) |
| `increasing` | Increasing revenue | `currentRevenue > previousRevenue` | `absDiffRevenue` DESC | all |
| `traffic` | Traffic decline (proxy) | `pctChangeUnits < 0` | `pctChangeUnits` ASC | all |

**Columns shown:** ASIN, Product Name, Revenue (previous period), Revenue (current period), Abs Diff (AED), % Diff.

**Calculations per ASIN:**

- `currentRevenue` = sum of `overallRevenue` in current period rows  
- `previousRevenue` = sum in comparison period  
- `absDiffRevenue` = current − previous  
- `pctChangeRevenue` = percent formula above  

CSV export uses same logic via `executiveAsinDeepDive.js` (`GET /dashboard/executive-asin-performance-csv`).

### PO / Buybox cards (backend)

- Buybox snapshot date picked from buybox `Date` fields aligned to `dateFilterType` (`pickBuyboxSnapshotDateKeyForExecutive`).
- Seller Central: latest buybox date; other channels: capped at **T-3** vs latest snapshot.

---

## Screen 2 — Revenue

**File:** `Revenue.jsx` — API: `GET /dashboard/revenue`

### Filters (UI)

| Filter | Field checked |
|--------|----------------|
| Search | asin, productName, category, salesChannel |
| ASIN | exact `row.asin` |
| Product name | exact |
| Category | `getRowProductCategory(row)` |
| Pack size | `getRowPackSize(row)` |
| Sales channel | `row.salesChannel`; `__ALL_CHANNELS__` merges all channels per ASIN |
| Date | `reportDate` (day/week) or `reportMonth` (month/year/custom) via API period meta or `getDateRangeForFilter` |

### Top 10 detailed view (`detailedView`)

Applied **after** all filters + ASIN merge (`aggregatedFilteredRows`):

| View ID | Label | Steps |
|---------|-------|--------|
| `all` | All SKUs | no extra filter |
| `best_units` | Top 10 Best – Units | sort `overallUnit` DESC → `slice(0, 10)` |
| `worst_units` | Top 10 Worst – Units | exclude `overallUnit === 0` → sort ASC → top 10 |
| `best_revenue` | Top 10 Best – Revenue | sort `overallRevenue` DESC → top 10 |
| `worst_revenue` | Top 10 Worst – Revenue | exclude `overallRevenue === 0` → sort ASC → top 10 |

**Sort column for table:** user-chosen (`sort.key`), default Product Name A–Z.

### KPI cards (client-side from filtered merged rows)

| KPI | Formula |
|-----|---------|
| Overall / Ad / Organic revenue & units | Sum over `aggregatedFilteredRows` |
| TACOS | `(sum adSpend) / (sum overallRevenue) * 100` |
| AOV (card) | average of row `aov` values (mean of per-line AOVs) |
| Trend % | `localComparison`: split rows by current vs comparison period sets, merge by ASIN, aggregate, then `pctChange` |

---

## Screen 3 — Inventory

**File:** `Inventory.jsx` — API: `GET /dashboard/inventory`

### Filters

| Filter | Logic |
|--------|--------|
| Search | asin, productName, category, channel |
| ASIN / product / category / channel | exact match (cascading dropdowns) |
| **Selected date** | `reportDate` (or `date` / `oosDate`) **equals** selected calendar day (snapshot, not a range) |
| Stock chip | see below |

### Stock filters (`stockFilter`)

| ID | Shows rows where |
|----|------------------|
| `ALL_SKUS` | all |
| `LOW_STOCK` | `status === 'Understock'` |
| `LOW_STOCK_OPEN_PO` | `noLowStockWithOpenPos === 1` |
| `LOW_STOCK_NO_OPEN_PO` | `noLowStockNoOpenPos === 1` |

### Summary KPIs (`computeSummary` on merged rows)

| KPI | Formula |
|-----|---------|
| Total available | sum `available` |
| Last 30D sales | sum `last30DaysSales` |
| Last 30D units | sum `last30DaysUnits` |
| Avg DOS | mean of `dos` (rounded) |
| Instock rate | mean of `instockRate` (1 decimal) |

No “Top 10” chip on Inventory; full table is paginated/sorted.

---

## Screen 4 — Buybox

**File:** `Buybox.jsx` — API: `GET /dashboard/buybox`, `buybox-last30-sales`

### Filters

| Filter | Logic |
|--------|--------|
| Search / ASIN / product / category / pack / channel | same pattern as Revenue |
| **Selected date** | `normalizeReportDate(row.reportDate) === selectedDate` |
| Stock chip | `ALL_SKUS` or `NO_BUYBOX` (hides rows where owner is Amazon.ae) |

### Key metrics (computed on **unique ASINs** after merge)

| Metric | Formula |
|--------|---------|
| Overall Buybox % | `round(amazonAeCount / totalUniqueAsins * 100)` |
| Amazon.ae SKUs | count ASINs whose owner contains `amazon.ae` (case insensitive) |
| No buybox SKUs | ASINs **not** Amazon.ae owner |

Owner field: `currentBuyboxOwner` from DB `Current Owner` / `BuyBox` variants.

No Top 10 list; optional sort on detailed columns.

---

## Screen 5 — Marketing

**File:** `Marketing.jsx` — API: `GET /dashboard/marketing`

### Two independent filter zones

**A — SKU / top KPI section (API params)**

- `dateFilterType`, `salesChannel`, `asin`, `productName`, `productCategory`, `packSize`
- Backend applies these to Mongo query for SKU rows and top metrics.

**B — Campaign section (API + UI)**

- API: `campaignDateRange`, `campaignType`, `campaignName`, `campaignPortfolio`, `campaignSalesChannel`
- UI further filters `campaignRows` by type, name, portfolio, channel.
- **Important:** Campaign filters do **not** change top SKU KPIs (by design in backend comments).

### SKU Top 10 (`skuGroupFilter`)

On `mergedSkuRows` (all SKU filters already applied via API):

| ID | Logic |
|----|--------|
| `BEST_REVENUE` | sort `overallRevenue` DESC → top 10 |
| `WORST_REVENUE` | `overallRevenue > 0` → sort ASC → top 10 |

### Campaign Top 10 (`campaignGroupFilter`)

On `filteredCampaignRows`:

| ID | Logic |
|----|--------|
| `HIGH_ACOS` | ACoS > 0, sort ACoS DESC → top 10 |
| `LOW_ACOS` | ACoS > 0, sort ACoS ASC → top 10 |
| `BEST_REVENUE` | revenue > 0, sort revenue DESC → top 10 |
| `WORST_REVENUE` | revenue > 0, sort revenue ASC → top 10 |

**ACoS per row:** field `ACoS` / `acos`, else `(Ad Spend / Ad Sales) * 100`  
**Revenue per row:** `Overall Revenue` / `overallRevenue` / `total_sales`

### Marketing formulas (per row or after ASIN merge)

| Metric | Formula |
|--------|---------|
| CTR | `(clicks / impressions) * 100` |
| CPC | `adSpend / clicks` |
| CVR | `(overallUnitSold / clicks) * 100` |
| ACoS | `(adSpend / adSales) * 100` |
| TACoS / TACOS | `(adSpend / overallRevenue) * 100` |
| Organic units | `max(0, overallUnitSold - adUnitSold)` |
| Organic revenue | `max(0, overallRevenue - adSales)` |

Mongo SKU fields commonly used: `total_units`, `total_sales`, `ads_spend`, `ads_sales`, `impressions`, `clicks`, `Date`.

---

## Agent training cheat sheet

When answering “how is Top 10 best revenue calculated?”:

1. Identify **screen** (Revenue vs Executive vs Marketing SKU vs Campaign).
2. List **active filters** (date, channel, product filters, stock chips).
3. Confirm data is **merged by ASIN** where applicable.
4. State **sort field** and **direction**, **exclude zeros** rule, and **`slice(0, 10)`**.
5. For KPI %/TACOS, state whether it’s **sum then ratio** (Revenue KPI TACOS) or **mean of row %** (merged AOV/TACOS on Revenue table).

**Canonical code references:**

- Revenue Top 10: `frontend/src/pages/sections/Revenue.jsx` (`tableRows` useMemo, `detailedView`)
- Executive Top 10: `ExecutiveSummary.jsx` (`activeDeepDiveTab === 'top_selling'`) + `backend/utils/executiveAsinDeepDive.js`
- Marketing Top 10: `Marketing.jsx` (`displayedSkuRows`, `filteredCampaignRows`)
- Date periods: `backend/routes/dashboardRoutes.js` (`getPeriodMonths`, `getPeriodDaysOrWeeks`)
- Revenue DB mapping: `dashboardRoutes.js` revenue `.map(doc)` block (~1659)

---

## Related brain files

- `brain/conventions-dates-api.md` — date formats, buybox API params  
- `brain/backend-api-flow.md` — endpoint flow diagram  
- `brain/database.md` — collections per company DB  
