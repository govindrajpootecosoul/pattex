import express from 'express';
import mongoose from 'mongoose';
import { getCompanyModels } from '../models/companyDb.js';
import Cache, { buildDashboardCacheKey } from '../utils/cache.js';

const router = express.Router();

// Attach company DB models from logged-in user's databaseName (e.g. pattex, emami)
router.use((req, res, next) => {
  try {
    if (!req.user?.databaseName) {
      return res.status(400).json({ message: 'User company database not set' });
    }
    req.companyModels = getCompanyModels(req.user.databaseName);
    next();
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Invalid company database' });
  }
});

function parseNum(val) {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSalesChannelOrFilter(raw) {
  const salesChannel = String(raw || '').trim();
  if (!salesChannel) return null;
  // Match tolerant of casing + accidental whitespace in stored values.
  // Example: "Seller Central" should match " seller central " in DB.
  const re = new RegExp(`^\\s*${escapeRegExp(salesChannel)}\\s*$`, 'i');
  return {
    $or: [
      { 'Sales Channel': { $regex: re } },
      { 'Sales Channel ': { $regex: re } },
      { salesChannel: { $regex: re } },
      { sales_channel: { $regex: re } },
      { channel: { $regex: re } },
    ],
  };
}

function normalizeKey(value) {
  // normalize field names like "Sales Channel", "Sales  Channel", "sales_channel", etc.
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]+/g, '');
}

function getFieldValueLoose(doc, desiredKey) {
  if (!doc || typeof doc !== 'object') return undefined;
  const target = normalizeKey(desiredKey);
  // Fast path: exact key
  if (Object.prototype.hasOwnProperty.call(doc, desiredKey)) return doc[desiredKey];
  // Loose path: scan keys (handles NBSP / double spaces / odd underscores)
  for (const k of Object.keys(doc)) {
    if (normalizeKey(k) === target) return doc[k];
  }
  return undefined;
}

function revenueChannelFromDoc(doc) {
  const raw =
    getFieldValueLoose(doc, 'Sales Channel') ??
    getFieldValueLoose(doc, 'salesChannel') ??
    getFieldValueLoose(doc, 'channel') ??
    '';
  if (raw == null) return '';
  return String(raw).trim();
}

function revenueAsinFromDoc(doc) {
  const raw =
    getFieldValueLoose(doc, 'ASIN') ??
    getFieldValueLoose(doc, 'asin') ??
    '';
  if (raw == null) return '';
  return String(raw).trim();
}

function revenueProductNameFromDoc(doc) {
  const raw =
    getFieldValueLoose(doc, 'Product Name') ??
    getFieldValueLoose(doc, 'productName') ??
    '';
  if (raw == null) return '';
  return String(raw).trim();
}

/**
 * Get list of YYYY-MM months for current and comparison period.
 * - Current month → compare to previous month
 * - Previous month → compare to month before that
 * - Custom single month (e.g. Feb) → compare to Jan
 * - Custom range → compare to same-length period immediately before
 * - Current year → compare to previous year
 * - Previous year → compare to year before that
 */
function getPeriodMonths(dateFilterType, customStart, customEnd, anchorDate) {
  // Data arrives with a T-3 lag; treat "current" as today-3 days (unless an anchor is provided).
  const now = anchorDate instanceof Date ? new Date(anchorDate) : new Date();
  now.setHours(0, 0, 0, 0);
  if (!(anchorDate instanceof Date)) now.setDate(now.getDate() - 3);
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  function monthList(startY, startM, count) {
    const list = [];
    const d = new Date(startY, startM, 1);
    for (let i = 0; i < count; i++) {
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() + 1);
    }
    return list;
  }

  if (dateFilterType === 'CURRENT_MONTH') {
    const current = monthList(y, m, 1);
    const comparison = monthList(y, m - 1, 1);
    return { current, comparison };
  }
  if (dateFilterType === 'PREVIOUS_MONTH') {
    const current = monthList(y, m - 1, 1);
    const comparison = monthList(y, m - 2, 1);
    return { current, comparison };
  }
  if (dateFilterType === 'CUSTOM_RANGE' && customStart) {
    const [sy, sm] = customStart.split('-').map(Number);
    const startDate = new Date(sy, (sm || 1) - 1, 1);
    let endDate;
    if (customEnd && customEnd >= customStart) {
      const [ey, em] = customEnd.split('-').map(Number);
      endDate = new Date(ey, (em || 1) - 1, 1);
    } else {
      endDate = new Date(startDate);
    }
    const current = [];
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = endDate.getTime();
    while (d.getTime() <= end) {
      current.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() + 1);
    }
    const len = current.length;
    const compStart = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1);
    const comparison = monthList(compStart.getFullYear(), compStart.getMonth(), len);
    return { current, comparison };
  }
  if (dateFilterType === 'CURRENT_YEAR') {
    const current = monthList(y, 0, 12);
    const comparison = monthList(y - 1, 0, 12);
    return { current, comparison };
  }
  if (dateFilterType === 'PREVIOUS_YEAR') {
    const current = monthList(y - 1, 0, 12);
    const comparison = monthList(y - 2, 0, 12);
    return { current, comparison };
  }
  return null;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toDDMonYY(dateKey) {
  if (!dateKey || dateKey === 'UNKNOWN') return dateKey;
  const d = typeof dateKey === 'string' && dateKey.length >= 10 ? new Date(dateKey.slice(0, 10) + 'T00:00:00.000Z') : new Date(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yy}`;
}

function effectiveNowForDataLag() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 3);
  return now;
}

function currentYearMonthKey() {
  const now = effectiveNowForDataLag();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthShortFromYearMonth(ym) {
  const m = parseInt(String(ym).split('-')[1] || '', 10);
  const idx = Number.isFinite(m) ? m - 1 : -1;
  return MONTHS_SHORT[Math.max(0, Math.min(11, idx))] || '';
}

function parseDateKey(value) {
  if (!value) return '';
  // Handles both Date objects and ISO/date-like strings.
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toYmd(value);
  const s = String(value).trim();
  // Accept DD-MMM-YYYY (e.g. "13-Mar-2026")
  const dddMonYyyy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (dddMonYyyy) {
    const day = parseInt(dddMonYyyy[1], 10);
    const monStr = dddMonYyyy[2];
    const year = parseInt(dddMonYyyy[3], 10);
    const mi = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === monStr.toLowerCase());
    if (mi >= 0 && year && day >= 1 && day <= 31) {
      const m = mi + 1;
      return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Accept `MM/DD/YYYY` or `DD/MM/YYYY` (heuristic: if first part > 12, treat as DD/MM).
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const a = parseInt(slash[1], 10);
    const b = parseInt(slash[2], 10);
    const y = parseInt(slash[3], 10);
    const isDayFirst = a > 12;
    const m = isDayFirst ? b : a;
    const d = isDayFirst ? a : b;
    if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  // Expect `YYYY-MM-DD...`
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toYmd(parsed);
  return '';
}

function dateMatchQuery(fieldName, dateKey) {
  if (!dateKey) return {};
  // Prefer string match (covers strings with timestamps).
  // If stored as Date type, also include range match.
  //
  // IMPORTANT: Date is often stored as strings like:
  // - "YYYY-MM-DD"
  // - "DD-MMM-YYYY" (e.g. "28-Feb-2026")
  // - "DD-MMM-YY"   (e.g. "28-Feb-26")
  // so we match all known representations for the same day.
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);
  const [yyyy, mm, dd] = String(dateKey).slice(0, 10).split('-');
  const monthIndex = Math.max(0, Math.min(11, (parseInt(mm, 10) || 1) - 1));
  const mon = MONTHS_SHORT[monthIndex];
  const ddMonYYYY = `${dd}-${mon}-${yyyy}`;
  const ddMonYY = `${dd}-${mon}-${String(yyyy).slice(-2)}`;
  return {
    $or: [
      { [fieldName]: { $regex: `^\\s*${dateKey}` } },
      { [fieldName]: { $regex: `^\\s*${ddMonYYYY}` } },
      { [fieldName]: { $regex: `^\\s*${ddMonYY}` } },
      { [fieldName]: { $gte: start, $lte: end } },
    ],
  };
}

function dateMatchQueryAny(fieldNames, dateKey) {
  const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  const clauses = [];
  fields.forEach((f) => {
    const q = dateMatchQuery(f, dateKey);
    if (q?.$or?.length) clauses.push(...q.$or);
  });
  return clauses.length ? { $or: clauses } : {};
}

function mongoNumberExpr(fieldPath) {
  return {
    $convert: {
      input: {
        $replaceAll: {
          input: { $toString: { $ifNull: [fieldPath, '0'] } },
          find: ',',
          replacement: '',
        },
      },
      to: 'double',
      onError: 0,
      onNull: 0,
    },
  };
}

function mongoNumberExprFromFirst(paths) {
  const list = Array.isArray(paths) ? paths : [];
  if (!list.length) return mongoNumberExpr('$__missing__');
  const coalesced = list.reduceRight((acc, p) => ({ $ifNull: [p, acc] }), '0');
  return {
    $convert: {
      input: {
        $replaceAll: {
          input: { $toString: coalesced },
          find: ',',
          replacement: '',
        },
      },
      to: 'double',
      onError: 0,
      onNull: 0,
    },
  };
}

async function latestDateKeyForCollection(collectionName, fieldName = 'Date') {
  const col = mongoose.connection?.db?.collection(collectionName);
  if (!col) return '';
  // Sort by Date descending; if Date is string `YYYY-MM-DD...` this also works lexicographically.
  const doc = await col.findOne({}, { sort: { [fieldName]: -1 }, projection: { [fieldName]: 1 } });
  return parseDateKey(doc?.[fieldName]);
}

function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateList(startDate, endDate) {
  const list = [];
  const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  d.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  while (d.getTime() <= end.getTime()) {
    list.push(toYmd(d));
    d.setDate(d.getDate() + 1);
  }
  return list;
}

function getPeriodDaysOrWeeks(dateFilterType) {
  // Data arrives with a T-3 lag; treat "current" as today-3 days.
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 3);

  if (dateFilterType === 'CURRENT_DAY') {
    const current = [toYmd(now)];
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    const comparison = [toYmd(prev)];
    return {
      periodType: 'DAY',
      current,
      comparison,
      labels: {
        currentLabel: toYmd(now),
        comparisonLabel: toYmd(prev),
      },
    };
  }

  if (dateFilterType === 'PREVIOUS_DAY') {
    const currentDate = new Date(now);
    currentDate.setDate(currentDate.getDate() - 1);
    const comparisonDate = new Date(now);
    comparisonDate.setDate(comparisonDate.getDate() - 2);
    return {
      periodType: 'DAY',
      current: [toYmd(currentDate)],
      comparison: [toYmd(comparisonDate)],
      labels: {
        currentLabel: toYmd(currentDate),
        comparisonLabel: toYmd(comparisonDate),
      },
    };
  }

  if (dateFilterType === 'CURRENT_WEEK') {
    const start = startOfWeekMonday(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);
    return {
      periodType: 'WEEK',
      current: dateList(start, end),
      comparison: dateList(prevStart, prevEnd),
      labels: {
        currentLabel: `${toYmd(start)} to ${toYmd(end)}`,
        comparisonLabel: `${toYmd(prevStart)} to ${toYmd(prevEnd)}`,
      },
    };
  }

  if (dateFilterType === 'PREVIOUS_WEEK') {
    const thisStart = startOfWeekMonday(now);
    const thisEnd = new Date(thisStart);
    thisEnd.setDate(thisEnd.getDate() + 6);
    const currentEnd = new Date(thisStart);
    currentEnd.setDate(currentEnd.getDate() - 1);
    const currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() - 6);
    const comparisonEnd = new Date(currentStart);
    comparisonEnd.setDate(comparisonEnd.getDate() - 1);
    const comparisonStart = new Date(comparisonEnd);
    comparisonStart.setDate(comparisonStart.getDate() - 6);
    return {
      periodType: 'WEEK',
      current: dateList(currentStart, currentEnd),
      comparison: dateList(comparisonStart, comparisonEnd),
      labels: {
        currentLabel: `${toYmd(currentStart)} to ${toYmd(currentEnd)}`,
        comparisonLabel: `${toYmd(comparisonStart)} to ${toYmd(comparisonEnd)}`,
      },
    };
  }

  return null;
}

function aggregateRevenueRows(rows) {
  let overallUnit = 0;
  let overallRevenue = 0;
  let adUnit = 0;
  let adRevenue = 0;
  let organicUnit = 0;
  let organicRevenue = 0;
  let totalAdSpend = 0;
  let count = 0;
  rows.forEach((r) => {
    overallUnit += parseNum(r.overallUnit);
    overallRevenue += parseNum(r.overallRevenue);
    adUnit += parseNum(r.adUnit);
    adRevenue += parseNum(r.adRevenue);
    organicUnit += parseNum(r.organicUnit);
    organicRevenue += parseNum(r.organicRevenue);
    count += 1;
    const rev = parseNum(r.overallRevenue);
    const spend = rev > 0 ? (parseNum(r.tacos) / 100) * rev : 0;
    totalAdSpend += spend;
  });
  const tacos = overallRevenue > 0 ? (totalAdSpend / overallRevenue) * 100 : 0;
  return {
    overallUnit,
    overallRevenue,
    adUnit,
    adRevenue,
    organicUnit,
    organicRevenue,
    tacos,
  };
}

function pctChange(current, previous) {
  if (previous === 0 || previous == null) return null;
  return ((current - previous) / previous) * 100;
}

function aggregateInventoryRows(rows) {
  if (!rows.length) return { totalAvailable: 0, last30Sales: 0, avgDos: 0, instockRate: 0 };
  const totalAvailable = rows.reduce((s, r) => s + parseNum(r.available), 0);
  const last30Sales = rows.reduce((s, r) => s + parseNum(r.last30DaysSales), 0);
  const totalDos = rows.reduce((s, r) => s + parseNum(r.dos), 0);
  const totalInstockRate = rows.reduce((s, r) => s + parseNum(r.instockRate), 0);
  const count = rows.length;
  return {
    totalAvailable,
    last30Sales,
    avgDos: count > 0 ? Math.round(totalDos / count) : 0,
    instockRate: count > 0 ? Math.round(totalInstockRate / count) : 0,
  };
}

function normalizeBuyboxOwner(owner) {
  if (owner == null) return '';
  return String(owner).trim().toLowerCase();
}

function isAmazonAeOwner(ownerNormalized) {
  return Boolean(ownerNormalized) && ownerNormalized.includes('amazon.ae');
}

function aggregateBuyboxRows(rows) {
  if (!rows.length) return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
  const asinToOwner = new Map();
  rows.forEach((r) => {
    if (r.asin) asinToOwner.set(r.asin, normalizeBuyboxOwner(r.currentBuyboxOwner));
  });
  const uniqueAsins = [...asinToOwner.keys()];
  const totalAsins = uniqueAsins.length;
  if (!totalAsins) return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
  const amazonAeCount = uniqueAsins.filter((asin) => isAmazonAeOwner(asinToOwner.get(asin))).length;
  const noBuyboxSkus = uniqueAsins.filter((asin) => !isAmazonAeOwner(asinToOwner.get(asin))).length;
  const overallBuyboxPct = Math.round((amazonAeCount / totalAsins) * 100);
  return { overallBuyboxPct, noBuyboxSkus, amazonAeCount };
}

// Static base data for dashboard sections (as per requirements).
// The "dataUpdated" field is computed dynamically per request from the
// underlying collections (e.g. Revenue, Inventory, Marketing, Buybox),
// so it is intentionally omitted here.
const executiveSummary = {
  title: 'Executive Summary',
  kpis: [
    { metric: 'Overall Revenue', target: 25000, actualBTL: 23500, actualMTD: 24200, variation: '-3.2%' },
    { metric: 'Overall Spend', target: 12000, actualBTL: 11800, actualMTD: 11500, variation: '+2.5%' },
  ],
  metrics: [
    { label: 'PO Received', value: 3000 },
    { label: 'Open PO', value: 2000 },
    { label: 'Scheduled PO', value: 1000 },
    { label: 'SBU MTD Batch', value: 12 },
  ],
};

const buybox = {
  title: 'Buybox',
  comingSoon: true,
  message: 'Buybox section – coming soon. VC and S. Auction, Buybox, Top of search data will be available here.',
};
//
// Marketing is computed dynamically from the `marketings` collection.

const productDetails = {
  title: 'Product Details',
  comingSoon: true,
  message: 'Product Details section – coming soon. Deep dive ASIN performance, last 30 days sales will be available here.',
};

// All dashboard routes return data; protected by auth
router.get('/latest-updated-date', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'latest-updated-date');
    const ttlSeconds = 300; // 5 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const datasetRaw = String(req.query.dataset || '').trim().toLowerCase();
    const salesChannel = String(req.query.salesChannel || '').trim();

    const datasetToModel = {
      revenue: req.companyModels.Revenue,
      inventory: req.companyModels.Inventory,
      buybox: req.companyModels.Buybox,
      marketing: req.companyModels.Marketing,
    };

    const Model = datasetToModel[datasetRaw];
    if (!Model) {
      return res.status(400).json({ message: 'Invalid dataset. Use: revenue | inventory | buybox | marketing' });
    }

    const filter = buildSalesChannelOrFilter(salesChannel) || {};

    // Only select a small set of likely date keys; some datasets use different casing.
    const docs = await Model.find(filter, { Date: 1, date: 1, DATE: 1 }).lean();
    let best = '';
    docs.forEach((d) => {
      const raw =
        getFieldValueLoose(d, 'Date') ??
        getFieldValueLoose(d, 'date') ??
        getFieldValueLoose(d, 'DATE');
      const key = parseDateKey(raw);
      if (key && (!best || key > best)) best = key;
    });

    const updatedAt = best ? `${best}T12:00:00.000Z` : new Date().toISOString();

    const payload = {
      dataset: datasetRaw,
      salesChannel: salesChannel || '',
      dateKey: best || '',
      updatedAt,
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching latest updated date:', error);
    return res.status(500).json({ message: 'Failed to fetch latest updated date' });
  }
});

// Distinct Sales Channels (for dropdowns). Not filtered by date or other params.
router.get('/sales-channels', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'sales-channels:v3');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const distinctFromModel = async (Model) => {
      if (!Model) return [];
      const [ch1, ch2, ch3, ch4, ch5] = await Promise.all([
        Model.distinct('Sales Channel').catch(() => []),
        Model.distinct('Sales Channel ').catch(() => []),
        Model.distinct('salesChannel').catch(() => []),
        Model.distinct('sales_channel').catch(() => []),
        Model.distinct('channel').catch(() => []),
      ]);
      const out = [];
      [...(ch1 || []), ...(ch2 || []), ...(ch3 || []), ...(ch4 || []), ...(ch5 || [])].forEach((v) => {
        if (v != null) out.push(v);
      });
      return out;
    };

    const [rev, inv, buy, mkt] = await Promise.all([
      distinctFromModel(req.companyModels?.Revenue),
      distinctFromModel(req.companyModels?.Inventory),
      distinctFromModel(req.companyModels?.Buybox),
      distinctFromModel(req.companyModels?.Marketing),
    ]);

    const set = new Map();
    [...rev, ...inv, ...buy, ...mkt].forEach((v) => {
      const s = v == null ? '' : String(v).trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (!set.has(key)) set.set(key, s);
    });

    const payload = {
      options: Array.from(set.values()).sort((x, y) => String(x).localeCompare(String(y))),
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching sales channel options:', error);
    return res.status(500).json({ message: 'Failed to fetch sales channel options' });
  }
});

router.get('/executive-summary', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'executive-summary');
    const ttlSeconds = 300; // 5 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const salesChannel = String(req.query.salesChannel || '').trim();
    const buyboxChannelMatch = buildSalesChannelOrFilter(salesChannel) || {};

    // Use the latest snapshot date across revenue + buybox datasets.
    // IMPORTANT: Do NOT rely on `sort({ Date: -1 })` because Date is often a string
    // like "13-Mar-2026", which doesn't sort chronologically.
    const [revenueDateKey, buyboxDateKey] = await Promise.all([
      (async () => {
        const docs = await req.companyModels.Revenue.find({}, { Date: 1, date: 1, DATE: 1 }).lean();
        let best = '';
        docs.forEach((d) => {
          const key = parseDateKey(d?.Date || d?.date || d?.DATE);
          if (key && (!best || key > best)) best = key;
        });
        return best;
      })(),
      (async () => {
        const docs = await req.companyModels.Buybox.find(buyboxChannelMatch, { Date: 1, date: 1, DATE: 1 }).lean();
        let best = '';
        docs.forEach((d) => {
          const key = parseDateKey(d?.Date || d?.date || d?.DATE);
          if (key && (!best || key > best)) best = key;
        });
        return best;
      })(),
    ]);

    const dataUpdated =
      [revenueDateKey, buyboxDateKey].filter(Boolean).sort().slice(-1)[0]
      || new Date().toISOString().slice(0, 10);

    // Executive Summary cards should not become 0 just because the newest
    // snapshot date contains empty/zero values for those fields.
    // So we pick the latest date where each metric actually exists (> 0).
    const openPoExpr = mongoNumberExprFromFirst([
      '$Open POs',
      '$Open POs ',
      '$Open PO',
      '$Open PO ',
      '$openPos',
      '$open_pos',
    ]);
    const poReceivedUnitsExpr = mongoNumberExprFromFirst([
      '$PO_received_Units',
      '$PO_received_Units ',
      '$PO Received Units',
      '$PO Received Units ',
      '$PO_received_units',
      '$po_received_units',
      '$poReceivedUnits',
    ]);
    const asinExpr = {
      $ifNull: [
        '$ASIN',
        {
          $ifNull: [
            '$ASIN ',
            { $ifNull: ['$asin', { $ifNull: ['$Asin', '$__missing_asin__'] }] },
          ],
        },
      ],
    };
    const productNameExpr = {
      $ifNull: ['$product_name', { $ifNull: ['$Product Name', { $ifNull: ['$Product Name ', { $ifNull: ['$productName', '$__missing_product__'] }] }] }],
    };
    const salesChannelExpr = {
      $ifNull: [
        '$sales_channel',
        {
          $ifNull: [
            '$Sales Channel',
            {
              $ifNull: [
                '$Sales Channel ',
                { $ifNull: ['$salesChannel', { $ifNull: ['$channel', '$__missing_channel__'] }] },
              ],
            },
          ],
        },
      ],
    };
    const currentOwnerExpr = {
      $ifNull: [
        '$current_owner',
        {
          $ifNull: [
            '$Current Owner',
            {
              $ifNull: [
                '$Current Owner ',
                {
                  $ifNull: [
                    '$CurrentOwner',
                    {
                      $ifNull: [
                        '$currentOwner',
                        {
                          $ifNull: [
                            '$BuyBox',
                            { $ifNull: ['$Buy Box', { $ifNull: ['$currentBuyboxOwner', '$Current Buybox Owner'] }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // Match Buybox page logic: use the latest snapshot date (optionally per Sales Channel),
    // then compute "no buybox" as any Current Owner that is NOT Amazon.ae on that same date.
    const buyboxDateKeyEffective = buyboxDateKey || dataUpdated;

    // ASIN lists for the latest snapshot in buyboxes.
    const openPODetailsPromise = (async () => {
      // From pattex.buyboxes, column "Open POs" > 0 on latest date.
      const match = {
        ...buyboxChannelMatch,
        ...dateMatchQueryAny(['Date', 'date', 'DATE'], buyboxDateKeyEffective),
        $expr: {
          $gt: [
            openPoExpr,
            0,
          ],
        },
      };
      const pipeline = [
        { $match: match },
        {
          $group: {
            _id: asinExpr,
            productName: { $first: productNameExpr },
            salesChannel: { $first: salesChannelExpr },
            openPOs: {
              $sum: openPoExpr,
            },
            poReceivedUnits: {
              $sum: poReceivedUnitsExpr,
            },
            currentOwner: {
              $first: currentOwnerExpr,
            },
          },
        },
        {
          $project: {
            _id: 0,
            asin: '$_id',
            productName: 1,
            salesChannel: 1,
            openPOs: 1,
            poReceivedUnits: 1,
            currentOwner: 1,
          },
        },
      ];
      const rows = await req.companyModels.Buybox.aggregate(pipeline);
      return rows;
    })();

    const poReceivedDetailsPromise = (async () => {
      // From pattex.buyboxes, column "PO_received_Units" > 0 on latest date.
      const match = {
        ...buyboxChannelMatch,
        ...dateMatchQueryAny(['Date', 'date', 'DATE'], buyboxDateKeyEffective),
        $expr: {
          $gt: [
            poReceivedUnitsExpr,
            0,
          ],
        },
      };
      const pipeline = [
        { $match: match },
        {
          $group: {
            _id: asinExpr,
            productName: { $first: productNameExpr },
            salesChannel: { $first: salesChannelExpr },
            openPOs: {
              $sum: openPoExpr,
            },
            poReceivedUnits: {
              $sum: poReceivedUnitsExpr,
            },
            currentOwner: {
              $first: currentOwnerExpr,
            },
          },
        },
        {
          $project: {
            _id: 0,
            asin: '$_id',
            productName: 1,
            salesChannel: 1,
            openPOs: 1,
            poReceivedUnits: 1,
            currentOwner: 1,
          },
        },
      ];
      const rows = await req.companyModels.Buybox.aggregate(pipeline);
      return rows;
    })();

    const skuNoBuyboxDetailsPromise = (async () => {
      // Distinct ASINs from buyboxes on latest date where Current Owner != Amazon.ae (and not blank).
      const ownerLowerExpr = {
        $toLower: {
          $toString: {
            $ifNull: [currentOwnerExpr, ''],
          },
        },
      };
      const match = {
        ...buyboxChannelMatch,
        ...dateMatchQueryAny(['Date', 'date', 'DATE'], buyboxDateKeyEffective),
        $expr: {
          $and: [
            {
              // Not Amazon.ae (match any value containing amazon.ae)
              $not: {
                $regexMatch: {
                  input: ownerLowerExpr,
                  regex: /amazon\.ae/,
                },
              },
            },
          ],
        },
      };

      const pipeline = [
        { $match: match },
        {
          $group: {
            _id: asinExpr,
            productName: { $first: productNameExpr },
            salesChannel: { $first: salesChannelExpr },
            openPOs: {
              $sum: openPoExpr,
            },
            poReceivedUnits: {
              $sum: poReceivedUnitsExpr,
            },
            currentOwner: {
              $first: currentOwnerExpr,
            },
          },
        },
        {
          $project: {
            _id: 0,
            asin: '$_id',
            productName: 1,
            salesChannel: 1,
            openPOs: 1,
            poReceivedUnits: 1,
            currentOwner: 1,
          },
        },
      ];
      const rows = await req.companyModels.Buybox.aggregate(pipeline);
      return rows;
    })();

    const [openPODetails, poReceivedDetails, skuNoBuyboxDetails] = await Promise.all([
      openPODetailsPromise,
      poReceivedDetailsPromise,
      skuNoBuyboxDetailsPromise,
    ]);

    const payload = {
      ...executiveSummary,
      dataUpdated,
      poSummary: {
        openPOs: openPODetails.length,
        poReceived: poReceivedDetails.length,
        skuNoBuybox: skuNoBuyboxDetails.length,
        openPODetails,
        poReceivedDetails,
        skuNoBuyboxDetails,
      },
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error computing executive summary updated date:', error);
    // Fallback to static executive summary without dynamic date.
    return res.json(executiveSummary);
  }
});

// Key Performance Metrics (Executive Summary KPI table)
// - Targets: from `targets` collection (fields like Year, Month, Overall Sales, Ad Spend, Sales Channel)
// - Actual (MTD): from `revenues` collection aggregated for current month (with T-3 lag)
router.get('/key-performance-metrics', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'key-performance-metrics');
    const ttlSeconds = 300; // 5 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const salesChannel = String(req.query.salesChannel || '').trim();
    const ym = currentYearMonthKey(); // YYYY-MM using effective now (today-3)
    const year = parseInt(ym.slice(0, 4), 10);
    const monthShort = monthShortFromYearMonth(ym); // e.g. "Jun"

    // Targets (current month) — allow channel filter if provided
    const targetFilter = {
      $and: [
        { $or: [{ Year: year }, { year }] },
        { $or: [{ Month: monthShort }, { month: monthShort }] },
      ],
    };
    if (salesChannel) {
      const scOr = buildSalesChannelOrFilter(salesChannel);
      if (scOr) targetFilter.$and.push(scOr);
    }

    const targetDocs = await req.companyModels.Target.find(targetFilter).lean();
    const targetOverallRevenue = targetDocs.reduce((s, d) => s + parseNum(d?.['Overall Sales'] ?? d?.overallSales ?? d?.overall_sales), 0);
    const targetOverallSpend = targetDocs.reduce((s, d) => s + parseNum(d?.['Ad Spend'] ?? d?.adSpend ?? d?.ad_spend), 0);

    // Actual MTD (current month) from revenues
    // Avoid loading the entire `revenues` collection into memory.
    const isoMonthPrefix = `${ym}-`;
    const yearYY = String(year).slice(-2);
    const dateOrPatterns = [
      // ISO-like: "YYYY-MM-DD..." (starts with `${ym}-`)
      { Date: { $regex: `^${isoMonthPrefix}` } },
    ];

    if (monthShort) {
      // DD-MMM-YYYY (e.g. "13-Mar-2026")
      dateOrPatterns.push({ Date: { $regex: new RegExp(`^\\d{1,2}-${monthShort}-${year}`, 'i') } });
      // DD-MMM-YY (e.g. "13-Mar-26")
      dateOrPatterns.push({ Date: { $regex: new RegExp(`^\\d{1,2}-${monthShort}-${yearYY}`, 'i') } });
    }

    const dateFilter = dateOrPatterns.length === 1 ? dateOrPatterns[0] : { $or: dateOrPatterns };
    const salesChannelFilterForActuals = buildSalesChannelOrFilter(salesChannel) || {};

    const revFilter = salesChannelFilterForActuals
      ? { $and: [dateFilter, salesChannelFilterForActuals] }
      : dateFilter;

    const revDocs = await req.companyModels.Revenue.find(revFilter).lean();

    const actualRows = revDocs.filter((d) => {
      const dateKey = parseDateKey(d?.Date || d?.date || d?.DATE);
      if (!dateKey) return false;
      if (dateKey.slice(0, 7) !== ym) return false;
      // DB query already strictly filtered by sales channel natively via buildSalesChannelOrFilter
      return true;
    });
    const actualOverallRevenue = actualRows.reduce((s, d) => s + parseNum(d?.total_sales ?? d?.totalSales ?? d?.['Overall Sales']), 0);
    const actualOverallSpend = actualRows.reduce((s, d) => s + parseNum(d?.ads_spend ?? d?.adSpend ?? d?.['Ad Spend']), 0);

    const variationPct = (actual, target) => {
      const t = Number(target) || 0;
      const a = Number(actual) || 0;
      if (t === 0) return null;
      return ((a - t) / t) * 100;
    };

    const payload = {
      year,
      month: monthShort,
      yearMonth: ym,
      salesChannel: salesChannel || '',
      targets: {
        overallRevenue: targetOverallRevenue,
        overallSpend: targetOverallSpend,
      },
      actualMTD: {
        overallRevenue: actualOverallRevenue,
        overallSpend: actualOverallSpend,
      },
      variation: {
        overallRevenuePct: variationPct(actualOverallRevenue, targetOverallRevenue),
        overallSpendPct: variationPct(actualOverallSpend, targetOverallSpend),
      },
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching key performance metrics:', error);
    return res.status(500).json({ message: 'Failed to fetch key performance metrics' });
  }
});
router.get('/revenue', async (req, res) => {
  try {
    // Bump cache key version so channel/date fixes take effect immediately.
    const cacheKey = buildDashboardCacheKey(req, 'revenue:v4');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const salesChannelFilter = String(req.query.salesChannel || '').trim();
    const docFilter = buildSalesChannelOrFilter(salesChannelFilter) || {};

    // Avoid loading the entire `revenues` collection.
    // We apply Mongo-side filtering for the selected date period (current + comparison).
    const dateFilterTypeQ = req.query.dateFilterType || '';
    const customRangeStartQ = req.query.customRangeStart || '';
    const customRangeEndQ = req.query.customRangeEnd || '';

    // Anchor "current" periods to the latest available date for the selected Sales Channel.
    // This fixes cases like Vendor Central where the most recent data may be months behind Seller Central.
    let anchorDateForPeriods = null;
    if (salesChannelFilter && dateFilterTypeQ && dateFilterTypeQ !== 'CUSTOM_RANGE') {
      const dateDocs = await req.companyModels.Revenue.find(docFilter, { Date: 1, date: 1, DATE: 1 }).lean();
      let best = '';
      dateDocs.forEach((d) => {
        const key = parseDateKey(d?.Date || d?.date || d?.DATE);
        if (key && (!best || key > best)) best = key;
      });
      if (best) {
        const d = new Date(`${best}T00:00:00.000Z`);
        if (!Number.isNaN(d.getTime())) {
          // Align with the T-3 window used elsewhere.
          d.setDate(d.getDate() - 3);
          anchorDateForPeriods = d;
        }
      }
    }

    let mongoDateFilter = {};
    if (dateFilterTypeQ) {
      const dayWeekPeriods = getPeriodDaysOrWeeks(dateFilterTypeQ);
      if (dayWeekPeriods) {
        const allowedDays = [...dayWeekPeriods.current, ...dayWeekPeriods.comparison];
        const clauses = [];
        allowedDays.forEach((dayKey) => {
          const q = dateMatchQueryAny(['Date', 'date', 'DATE'], dayKey);
          if (q?.$or?.length) clauses.push(...q.$or);
        });
        if (clauses.length) mongoDateFilter = { $or: clauses };
      } else {
        const periods = getPeriodMonths(dateFilterTypeQ, customRangeStartQ, customRangeEndQ, anchorDateForPeriods);
        if (periods) {
          const allowedMonths = [...periods.current, ...periods.comparison];
          const monthOr = [];
          allowedMonths.forEach((ym) => {
            if (!ym || typeof ym !== 'string' || ym.length < 7) return;
            const year4 = parseInt(ym.slice(0, 4), 10);
            const ymShort = monthShortFromYearMonth(ym);
            const yearYY = String(year4).slice(-2);
            const isoMonthPrefix = `${ym}-`;
            // ISO-like: allow accidental leading whitespace
            monthOr.push({ Date: { $regex: `^\\s*${isoMonthPrefix}` } });
            if (ymShort) {
              monthOr.push({ Date: { $regex: new RegExp(`^\\\\s*\\\\d{1,2}-${ymShort}-${year4}`, 'i') } });
              monthOr.push({ Date: { $regex: new RegExp(`^\\\\s*\\\\d{1,2}-${ymShort}-${yearYY}`, 'i') } });
            }
            // Date type: range for the month (only matches if Date is stored as actual Date)
            const start = new Date(`${ym}-01T00:00:00.000Z`);
            if (!Number.isNaN(start.getTime())) {
              const end = new Date(start);
              end.setUTCMonth(end.getUTCMonth() + 1);
              monthOr.push({ Date: { $gte: start, $lt: end } });
            }
          });
          // Include `year_month` only when it looks like a valid YYYY-MM.
          // Some imports set `year_month` to "0" or other junk; exclude those.
          monthOr.push({
            $and: [
              { year_month: { $in: allowedMonths } },
              { year_month: { $regex: /^\d{4}-\d{2}$/ } },
            ],
          });
          if (monthOr.length) mongoDateFilter = { $or: monthOr };
        }
      }
    }

    const docsFilter =
      Object.keys(docFilter).length && Object.keys(mongoDateFilter).length
        ? { $and: [docFilter, mongoDateFilter] }
        : Object.keys(mongoDateFilter).length
          ? mongoDateFilter
          : docFilter;

    let docs = await req.companyModels.Revenue.find(docsFilter).lean();

    // If Sales Channel is selected but Mongo-side filter returns nothing,
    // the underlying dataset may have a non-standard field name for "Sales Channel"
    // (e.g. NBSP in the key). Fall back to date-only query then filter in JS.
    if (!docs.length && salesChannelFilter) {
      const dateOnlyFilter = Object.keys(mongoDateFilter).length ? mongoDateFilter : {};
      const altDocs = await req.companyModels.Revenue.find(dateOnlyFilter).lean();
      const wanted = String(salesChannelFilter).trim().toLowerCase();
      docs = altDocs.filter((d) => String(revenueChannelFromDoc(d) || '').trim().toLowerCase() === wanted);
    }
    const rows = docs
      .map((doc, index) => {
        const totalUnits = parseNum(doc.total_units);
        const totalSales = parseNum(doc.total_sales);
        const adUnits = parseNum(doc.ads_unit_sold);
        const adRevenue = parseNum(doc.ads_sales);
        const organicRevenue = parseNum(doc.organic_sale);
        const organicUnits = Math.max(0, totalUnits - adUnits);
        const aov = totalUnits > 0 ? totalSales / totalUnits : 0;
        const adsSpend = parseNum(doc.ads_spend);
        const tacos = totalSales > 0 ? (adsSpend / totalSales) * 100 : 0;
        const snapshotDateKey = parseDateKey(doc.Date || doc.date || doc.DATE);
        const reportDate = snapshotDateKey || '';
        const ymRaw = doc?.year_month != null ? String(doc.year_month).trim() : '';
        const ym = /^\d{4}-\d{2}$/.test(ymRaw) ? ymRaw : '';
        const reportMonth = snapshotDateKey ? snapshotDateKey.slice(0, 7) : ym;
        const asin = revenueAsinFromDoc(doc);
        const productName = revenueProductNameFromDoc(doc);
        const salesChannel = revenueChannelFromDoc(doc);
        const productCategory =
          doc.product_category ??
          doc.product_sub_category ??
          doc['Product Category'] ??
          doc['Product Sub Category'] ??
          doc.productCategory ??
          doc.productSubCategory ??
          '';
        const packSizeRaw =
          doc.pack_size ??
          doc['Pack Size'] ??
          doc.Pack_Size ??
          doc.packSize ??
          '';
        const packSize = packSizeRaw != null ? String(packSizeRaw) : '';

        return {
          id: doc._id?.toString() || String(index + 1),
          Date: doc.Date || doc.date || doc.DATE || '',
          asin,
          productName,
          // Keep legacy camelCase for existing frontend use, but ensure it is always populated.
          productCategory,
          packSize,
          // Also expose canonical snake_case keys (as requested) for consumers.
          product_category: productCategory,
          pack_size: packSize,
          salesChannel,
          reportMonth,
          snapshotDate: snapshotDateKey,
          reportDate,
          overallUnit: totalUnits,
          overallRevenue: totalSales,
          adUnit: adUnits,
          adRevenue,
          organicUnit: organicUnits,
          organicRevenue,
          newToBrandUnit: 0,
          repeatUnit: 0,
          promotionalUnit: 0,
          aov,
          tacos,
          adSpend: adsSpend,
        };
      })
      .filter((r) => r.asin || r.productName || r.salesChannel);

    // Latest data date for Revenue – used by frontend to show
    // "Data updated as of" based on the most recent document.
    const latestRevenueDoc = docs.reduce((latest, cur) => {
      const curDateStr = cur.Date || cur.date || cur.DATE;
      const curDate = curDateStr ? new Date(curDateStr) : null;
      if (!curDate || Number.isNaN(curDate.getTime())) return latest;
      if (!latest) return cur;
      const latestDateStr = latest.Date || latest.date || latest.DATE;
      const latestDate = latestDateStr ? new Date(latestDateStr) : null;
      if (!latestDate || Number.isNaN(latestDate.getTime())) return cur;
      return curDate > latestDate ? cur : latest;
    }, null);
    const updatedAtStr = latestRevenueDoc?.Date || latestRevenueDoc?.date || latestRevenueDoc?.DATE;
    const updatedAt = updatedAtStr
      ? new Date(updatedAtStr).toISOString()
      : new Date().toISOString();

    const dateFilterType = req.query.dateFilterType || '';
    const customRangeStart = req.query.customRangeStart || '';
    const customRangeEnd = req.query.customRangeEnd || '';
    const includePeriods = String(req.query.includePeriods || '') === '1';
    let comparison = null;
    let periodsOut = null;
    let currentRowsOut = null;
    let comparisonRowsOut = null;
    let periodLabelsOut = null;
    let periodTypeOut = null;

    if (dateFilterType) {
      const dayWeekPeriods = getPeriodDaysOrWeeks(dateFilterType);
      const periods = dayWeekPeriods || getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd);
      if (periods) {
        periodsOut = { current: periods.current, comparison: periods.comparison };
        periodLabelsOut = periods.labels || null;
        periodTypeOut = periods.periodType || 'MONTH';
        const currentSet = new Set(periods.current);
        const comparisonSet = new Set(periods.comparison);
        const keyField = dayWeekPeriods ? 'reportDate' : 'reportMonth';
        const currentRows = rows.filter((r) => r[keyField] && currentSet.has(r[keyField]));
        const comparisonRows = rows.filter((r) => r[keyField] && comparisonSet.has(r[keyField]));
        if (includePeriods) {
          currentRowsOut = currentRows;
          comparisonRowsOut = comparisonRows;
        }
        const curr = aggregateRevenueRows(currentRows);
        const prev = aggregateRevenueRows(comparisonRows);

        const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

        comparison = {
          overall: {
            pctChange: fmt(pctChange(curr.overallRevenue, prev.overallRevenue)),
            pctChangeUnits: fmt(pctChange(curr.overallUnit, prev.overallUnit)),
          },
          ad: {
            pctChange: fmt(pctChange(curr.adRevenue, prev.adRevenue)),
            pctChangeUnits: fmt(pctChange(curr.adUnit, prev.adUnit)),
          },
          organic: {
            pctChange: fmt(pctChange(curr.organicRevenue, prev.organicRevenue)),
            pctChangeUnits: fmt(pctChange(curr.organicUnit, prev.organicUnit)),
          },
          tacos: {
            pctChange: fmt(pctChange(curr.tacos, prev.tacos)),
          },
        };
      }
    }

    const payload = {
      title: 'Revenue',
      rows,
      total: rows.length,
      updatedAt,
      ...(includePeriods && periodsOut && currentRowsOut && comparisonRowsOut && {
        periods: periodsOut,
        periodType: periodTypeOut,
        periodLabels: periodLabelsOut,
        currentRows: currentRowsOut,
        comparisonRows: comparisonRowsOut,
      }),
      ...(comparison && { comparison }),
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({ message: 'Failed to fetch revenue data' });
  }
});

// Marketing dashboard – pulls data from the `marketings` collection and
// returns KPI cards + combo chart data (line vs bar) similar to Amazon.
router.get('/marketing', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'marketing');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    // Debug helper: quickly inspect available fields in a single doc.
    // This is useful when the upstream sheet uses different date field names.
    if (String(req.query.debug || '') === '1') {
      const sample = await req.companyModels.Marketing.findOne({}).lean();
      const keys = sample ? Object.keys(sample) : [];
      return res.json({
        ok: true,
        sample: sample
          ? {
            Date: sample.Date,
            date: sample.date,
            DATE: sample.DATE,
            keys: keys.slice(0, 80),
          }
          : null,
      });
    }

    // Marketing data can have mixed Date formats (and sometimes Date types).
    // We still normalize with `parseDateKey()` later, but we must avoid loading the entire collection.
    // So we pre-filter in Mongo using a broad $or that covers known formats.
    const dateFilterType = req.query.dateFilterType || '';
    const customRangeStart = req.query.customRangeStart || '';
    const customRangeEnd = req.query.customRangeEnd || '';
    const asinFilter = req.query.asin || '';
    const productNameFilter = req.query.productName || '';
    const productCategoryFilter = req.query.productCategory || '';
    const packSizeFilter = req.query.packSize || '';
    const salesChannelFilter = req.query.salesChannel || '';

    const campaignDateRange = req.query.campaignDateRange || '';
    const campaignTypeFilter = req.query.campaignType || '';
    const campaignNameFilter = req.query.campaignName || '';
    const campaignPortfolioFilter = req.query.campaignPortfolio || '';
    const campaignSalesChannelFilter = req.query.campaignSalesChannel || '';

    const mongoFilter = {};
    const addAnd = (clause) => {
      if (!clause) return;
      mongoFilter.$and = [...(mongoFilter.$and || []), clause];
    };

    // Support both sheet-style keys ("ASIN", "Sales Channel") and normalized DB keys ("asin", "sales_channel").
    const exactRegex = (value) =>
      new RegExp(`^\\s*${escapeRegExp(String(value).trim())}\\s*$`, 'i');

    if (asinFilter) {
      const re = exactRegex(asinFilter);
      addAnd({
        $or: [{ ASIN: { $regex: re } }, { asin: { $regex: re } }],
      });
    }

    if (productNameFilter) {
      const re = exactRegex(productNameFilter);
      addAnd({
        $or: [{ 'Product Name': { $regex: re } }, { product_name: { $regex: re } }, { productName: { $regex: re } }],
      });
    }

    if (packSizeFilter) {
      const re = exactRegex(packSizeFilter);
      addAnd({
        $or: [{ 'Pack Size': { $regex: re } }, { pack_size: { $regex: re } }, { packSize: { $regex: re } }],
      });
    }

    if (salesChannelFilter || campaignSalesChannelFilter) {
      // If campaign sales channel differs from the top sales channel, we must NOT
      // pre-filter Mongo down to only the top channel; otherwise campaign dropdowns
      // (name/portfolio/type) will be empty. So we fetch docs matching either channel,
      // then apply top/campaign channel filters in-memory per section.
      const normalize = (v) => String(v ?? '').trim().toLowerCase();
      const topNorm = normalize(salesChannelFilter);
      const campNorm = normalize(campaignSalesChannelFilter);
      const channelValues = [];
      if (topNorm) channelValues.push(salesChannelFilter);
      if (campNorm && campNorm !== topNorm) channelValues.push(campaignSalesChannelFilter);

      if (channelValues.length === 1) {
        const re = exactRegex(channelValues[0]);
        addAnd({
          $or: [
            { 'Sales Channel': { $regex: re } },
            { sales_channel: { $regex: re } },
            { salesChannel: { $regex: re } },
            { channel: { $regex: re } },
          ],
        });
      } else if (channelValues.length > 1) {
        const res = channelValues.map((v) => exactRegex(v));
        const fieldNames = ['Sales Channel', 'sales_channel', 'salesChannel', 'channel'];
        const channelOr = [];
        fieldNames.forEach((field) => {
          res.forEach((re) => {
            channelOr.push({ [field]: { $regex: re } });
          });
        });
        addAnd({ $or: channelOr });
      }
    }

    if (productCategoryFilter) {
      const re = exactRegex(productCategoryFilter);
      addAnd({
        $or: [
          { 'Product Category': { $regex: re } },
          { 'Product Sub Category': { $regex: re } },
          { product_category: { $regex: re } },
          { product_sub_category: { $regex: re } },
          { productCategory: { $regex: re } },
        ],
      });
    }

    // IMPORTANT: Campaign filters are applied later (in-memory) to only the campaign section.
    // Do NOT apply them to the initial Mongo query, otherwise campaign selections would
    // incorrectly change the top KPIs / SKU view and can also hide data unexpectedly.

    // Date prefilter: current + comparison months (or campaignDateRange months when provided).
    // NOTE: If this prefilter yields 0 docs, we fall back to "no date prefilter"
    // to avoid hiding real data when the dataset is behind the current period.
    const basePeriods = dateFilterType ? getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd) : null;
    const campaignPeriodsForQuery = campaignDateRange ? getPeriodMonths(campaignDateRange, '', '') : null;
    const periodsForQuery = campaignPeriodsForQuery || basePeriods;

    if (periodsForQuery) {
      const allowedSet = new Set(
        [...periodsForQuery.current, ...periodsForQuery.comparison].filter(Boolean),
      );

      // Expand window backwards to tolerate data lag (keeps query bounded).
      const anchor = periodsForQuery.current?.[0] || periodsForQuery.comparison?.[0] || '';
      if (anchor && typeof anchor === 'string' && anchor.length >= 7) {
        const [ay, am] = anchor.slice(0, 7).split('-').map(Number);
        if (ay && am) {
          const d = new Date(ay, am - 1, 1);
          for (let i = 0; i < 3; i++) {
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            allowedSet.add(ym);
            d.setMonth(d.getMonth() - 1);
          }
        }
      }

      const allowedMonths = Array.from(allowedSet);
      const dateOr = [];

      allowedMonths.forEach((ym) => {
        if (!ym || typeof ym !== 'string' || ym.length < 7) return;
        const yyyy = ym.slice(0, 4);
        const mm = ym.slice(5, 7); // "01".."12"
        const mInt = parseInt(mm, 10) || 0;
        const mNoPad = mInt ? String(mInt) : '';
        const monthShort = monthShortFromYearMonth(ym);
        const yy = yyyy.slice(-2);

        // ISO-like strings: "YYYY-MM-DD..."
        dateOr.push({ Date: { $regex: `^\\s*${ym}-` } });
        // Some sources store only "YYYY-MM" without a day.
        dateOr.push({ Date: { $regex: `^\\s*${ym}$` } });
        dateOr.push({ Date: { $regex: `^\\s*${ym}` } });
        // YYYY/MM[/DD] variants
        dateOr.push({ Date: new RegExp(`^\\\\s*${yyyy}[-\\\\/]${mm}`) });

        // DD-MMM-YYYY / DD-MMM-YY
        if (monthShort) {
          dateOr.push({ Date: new RegExp(`^\\\\s*\\\\d{1,2}-${monthShort}-${yyyy}`, 'i') });
          dateOr.push({ Date: new RegExp(`^\\\\s*\\\\d{1,2}-${monthShort}-${yy}`, 'i') });
          // Month-first formats like "Mar-2026" / "Mar 2026"
          dateOr.push({ Date: new RegExp(`^\\\\s*${monthShort}[-\\\\s]${yyyy}`, 'i') });
          dateOr.push({ Date: new RegExp(`^\\\\s*${monthShort}[-\\\\s]${yy}`, 'i') });
          // Unanchored fallback (covers prefixes / unexpected wrappers)
          dateOr.push({ Date: new RegExp(`${monthShort}-${yyyy}`, 'i') });
          dateOr.push({ Date: new RegExp(`${monthShort}-${yy}`, 'i') });
        }

        // Slash formats: "MM/DD/YYYY" or "DD/MM/YYYY" (match either month position)
        if (mNoPad) {
          dateOr.push({ Date: new RegExp(`^(${mm}|${mNoPad})\\\\/\\\\d{1,2}\\\\/${yyyy}`) });
          dateOr.push({ Date: new RegExp(`^\\\\d{1,2}\\\\/(${mm}|${mNoPad})\\\\/${yyyy}`) });
        } else {
          dateOr.push({ Date: new RegExp(`^${mm}\\\\/\\\\d{1,2}\\\\/${yyyy}`) });
          dateOr.push({ Date: new RegExp(`^\\\\d{1,2}\\\\/${mm}\\\\/${yyyy}`) });
        }

        // Date type: range for the month (only matches if Date is stored as actual Date)
        const start = new Date(`${yyyy}-${mm}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        dateOr.push({ Date: { $gte: start, $lt: end } });
      });

      // Prefer `year_month` when present, but also support datasets that only have `date`/`Date`.
      // This prevents "empty results" when the month key or the date field name differs.
      const monthOr = [
        { year_month: { $in: allowedMonths } },
        { yearMonth: { $in: allowedMonths } },
        { 'Year Month': { $in: allowedMonths } },
      ];

      // Expand Date clauses to also match `date` / `DATE`.
      const dateFields = ['Date', 'date', 'DATE'];
      dateOr.forEach((clause) => {
        const val = clause?.Date;
        if (val == null) return;
        dateFields.forEach((f) => monthOr.push({ [f]: val }));
      });

      addAnd({ $or: monthOr });
    }

    if (String(req.query.debugCount || '') === '1') {
      const sampleMatches = await req.companyModels.Marketing
        .find(mongoFilter, { Date: 1, ASIN: 1, 'Sales Channel': 1 })
        .limit(5)
        .lean();
      const count = await req.companyModels.Marketing.countDocuments(mongoFilter);
      return res.json({
        ok: true,
        count,
        sampleMatches,
        periodForQuery: periodsForQuery || null,
        hasDateAnd: Boolean(mongoFilter.$and?.length),
      });
    }

    if (String(req.query.debugCount || '') === '2') {
      const sample = await req.companyModels.Marketing.findOne({}, { Date: 1 }).lean();
      const countAny = await req.companyModels.Marketing.estimatedDocumentCount();
      const countMar2026 = await req.companyModels.Marketing.countDocuments({ Date: /Mar-2026/i });
      const countIso202603 = await req.companyModels.Marketing.countDocuments({ Date: /^2026-03/ });
      const countExactSamplePrefix = sample?.Date
        ? await req.companyModels.Marketing.countDocuments({ Date: new RegExp(`^${String(sample.Date).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`) })
        : 0;
      return res.json({
        ok: true,
        sampleDate: sample?.Date ?? null,
        countAny,
        countMar2026,
        countIso202603,
        countExactSamplePrefix,
      });
    }

    if (String(req.query.debugCount || '') === '3') {
      const sample = await req.companyModels.Marketing.findOne({}, { Date: 1 }).lean();
      const ym = currentYearMonthKey();
      const year = ym.slice(0, 4);
      const mm = ym.slice(5, 7);
      const mon = monthShortFromYearMonth(ym);
      const patterns = [
        `^\\\\d{1,2}-${mon}-${year}`,
        `^${mon}[-\\\\s]${year}`,
        `^${ym}-`,
      ];
      const counts = await Promise.all([
        req.companyModels.Marketing.countDocuments({ Date: new RegExp(patterns[0], 'i') }),
        req.companyModels.Marketing.countDocuments({ Date: new RegExp(patterns[1], 'i') }),
        req.companyModels.Marketing.countDocuments({ Date: { $regex: patterns[2] } }),
      ]);
      return res.json({
        ok: true,
        sampleDate: sample?.Date ?? null,
        ym,
        mon,
        patterns,
        counts,
      });
    }

    const projection = {
      Date: 1, date: 1, DATE: 1,
      ASIN: 1, asin: 1,
      'Product Name': 1, product_name: 1,
      'Product Category': 1, product_category: 1,
      'Product Sub Category': 1, product_sub_category: 1,
      'Pack Size': 1, pack_size: 1,
      'Sales Channel': 1, sales_channel: 1,
      'Available Inventory': 1, available_inventory: 1,
      DOS: 1, dos: 1,
      Impressions: 1, impressions: 1,
      Clicks: 1, clicks: 1,
      ads_spend: 1,
      ads_unit_sold: 1,
      ads_sales: 1,
      total_units: 1,
      total_sales: 1,
      'Campaign Type': 1, campaign_type: 1,
      'Campaign Name': 1, campaign_name: 1,
      'Portfolio name': 1, portfolio_name: 1,
    };

    let docs = await req.companyModels.Marketing.find(mongoFilter, projection).lean();

    if (!docs || docs.length === 0) {
      return res.json({
        title: 'Marketing',
        metrics: {},
        chartData: [],
        funnelMetrics: [],
        skuRows: [],
        campaignMetrics: {},
        campaignRows: [],
        salesChannelOptions: [],
      });
    }

    // Unique Sales Channel values from entire collection (for dropdowns, not limited by date or filters)
    // Use `distinct()` to avoid loading all docs into memory.
    const [channelsA, channelsB, channelsC, channelsD] = await Promise.all([
      req.companyModels.Marketing.distinct('Sales Channel'),
      req.companyModels.Marketing.distinct('salesChannel'),
      req.companyModels.Marketing.distinct('channel'),
      // snake_case keys used by some datasets
      req.companyModels.Marketing.distinct('sales_channel'),
    ]);
    const salesChannelSet = new Map();
    [...(channelsA || []), ...(channelsB || []), ...(channelsC || []), ...(channelsD || [])].forEach((v) => {
      const s = v == null ? '' : String(v).trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (!salesChannelSet.has(key)) salesChannelSet.set(key, s);
    });
    const salesChannelOptions = Array.from(salesChannelSet.values()).sort((a, b) => String(a).localeCompare(String(b)));

    let periods = dateFilterType ? getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd) : null;
    let currentSet = periods ? new Set(periods.current) : null;
    let comparisonSet = periods ? new Set(periods.comparison) : null;

    const reportMonthForDoc = (doc) => {
      const ymd = parseDateKey(doc.Date || doc.date || doc.DATE);
      return ymd ? ymd.slice(0, 7) : '';
    };

    const normalizeKey = (v) =>
      String(v ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const applyMarketingFiltersNoChannel = (doc) => {
      if (asinFilter && normalizeKey(doc.ASIN ?? doc.asin ?? '') !== normalizeKey(asinFilter)) return false;
      if (
        productNameFilter
        && normalizeKey(doc['Product Name'] ?? doc.product_name ?? '') !== normalizeKey(productNameFilter)
      ) return false;
      if (productCategoryFilter) {
        const cat = normalizeKey(productCategoryFilter);
        const docCat = normalizeKey(doc['Product Category'] ?? doc.product_category ?? '');
        const docSubCat = normalizeKey(doc['Product Sub Category'] ?? doc.product_sub_category ?? '');
        if (cat && docCat !== cat && docSubCat !== cat) return false;
      }
      if (packSizeFilter && normalizeKey(doc['Pack Size'] ?? doc.pack_size ?? '') !== normalizeKey(packSizeFilter)) return false;
      return true;
    };

    const applyMarketingFilters = (doc) => {
      if (asinFilter && normalizeKey(doc.ASIN ?? doc.asin ?? '') !== normalizeKey(asinFilter)) return false;
      if (
        productNameFilter
        && normalizeKey(doc['Product Name'] ?? doc.product_name ?? '') !== normalizeKey(productNameFilter)
      ) return false;
      if (productCategoryFilter) {
        const cat = normalizeKey(productCategoryFilter);
        const docCat = normalizeKey(doc['Product Category'] ?? doc.product_category ?? '');
        const docSubCat = normalizeKey(doc['Product Sub Category'] ?? doc.product_sub_category ?? '');
        if (cat && docCat !== cat && docSubCat !== cat) return false;
      }
      if (packSizeFilter && normalizeKey(doc['Pack Size'] ?? doc.pack_size ?? '') !== normalizeKey(packSizeFilter)) return false;
      if (
        salesChannelFilter
        && normalizeKey(doc['Sales Channel'] ?? doc.sales_channel ?? doc.salesChannel ?? doc.channel ?? '') !== normalizeKey(salesChannelFilter)
      ) return false;
      return true;
    };

    const docsFiltered = docs.filter(applyMarketingFilters);
    const docsFilteredNoChannel = docs.filter(applyMarketingFiltersNoChannel);

    let docsForCurrent = currentSet ? docsFiltered.filter((d) => currentSet.has(reportMonthForDoc(d))) : docsFiltered;
    let docsForComparison = comparisonSet ? docsFiltered.filter((d) => comparisonSet.has(reportMonthForDoc(d))) : [];

    // If the selected period has no rows (common when data is behind), fall back to latest available month.
    if (periods && docsForCurrent.length === 0 && docsFiltered.length > 0) {
      let bestYm = '';
      docsFiltered.forEach((d) => {
        const ym = reportMonthForDoc(d);
        if (ym && (!bestYm || ym > bestYm)) bestYm = ym;
      });

      if (bestYm) {
        const [by, bm] = bestYm.split('-').map(Number);
        const prev = new Date(by, (bm || 1) - 2, 1);
        const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        periods = { current: [bestYm], comparison: [prevYm] };
        currentSet = new Set(periods.current);
        comparisonSet = new Set(periods.comparison);
        docsForCurrent = docsFiltered.filter((d) => currentSet.has(reportMonthForDoc(d)));
        docsForComparison = docsFiltered.filter((d) => comparisonSet.has(reportMonthForDoc(d)));
      }
    }

    const applyCampaignFilters = (doc) => {
      if (
        campaignTypeFilter
        && normalizeKey(doc['Campaign Type'] ?? doc.campaign_type ?? '') !== normalizeKey(campaignTypeFilter)
      ) return false;
      if (
        campaignNameFilter
        && normalizeKey(doc['Campaign Name'] ?? doc.campaign_name ?? '') !== normalizeKey(campaignNameFilter)
      ) return false;
      if (
        campaignPortfolioFilter
        && normalizeKey(doc['Portfolio name'] ?? doc.portfolio_name ?? '') !== normalizeKey(campaignPortfolioFilter)
      ) return false;
      if (
        campaignSalesChannelFilter
        && normalizeKey(doc['Sales Channel'] ?? doc.sales_channel ?? doc.salesChannel ?? doc.channel ?? '') !== normalizeKey(campaignSalesChannelFilter)
      ) return false;
      return true;
    };

    // Campaign section should respect top filters (asin/product/category/pack) but use its own sales channel selector.
    // When campaignSalesChannelFilter is set, do not require the top salesChannelFilter to match too.
    const campaignSeed = campaignSalesChannelFilter ? docsFilteredNoChannel : docsFiltered;
    const docsForCampaignBase = campaignSeed.filter(applyCampaignFilters);

    const campaignPeriods = campaignDateRange
      ? getPeriodMonths(campaignDateRange, '', '')
      : periods;
    const campaignCurrentSet = campaignPeriods ? new Set(campaignPeriods.current) : null;

    const docsForCampaign = campaignCurrentSet
      ? docsForCampaignBase.filter((d) => campaignCurrentSet.has(reportMonthForDoc(d)))
      : docsForCampaignBase;

    // Aggregate SKU-level rows (by ASIN) for "Detailed SKU Level Marketing View"
    const byAsin = new Map();
    docsForCurrent.forEach((doc) => {
      const asin = doc.ASIN ?? doc.asin ?? '';
      const key = String(asin || '').trim() || 'UNKNOWN';
      if (!byAsin.has(key)) {
        byAsin.set(key, {
          asin: key,
          productName: doc['Product Name'] ?? doc.product_name ?? '',
          productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? doc.product_category ?? doc.product_sub_category ?? '',
          packSize: doc['Pack Size'] ?? doc.pack_size != null ? String(doc['Pack Size'] ?? doc.pack_size) : '',
          salesChannel: doc['Sales Channel'] ?? doc.sales_channel ?? '',
          latestDateKey: '',
          availableInventoryLatest: 0,
          dosLatest: 0,
          impressions: 0,
          clicks: 0,
          adSpend: 0,
          adUnitSold: 0,
          adSales: 0,
          overallUnitSold: 0,
          overallRevenue: 0,
          last30Sales: 0,
          tacos: 0,
          organicUnitSold: 0,
          organicRevenue: 0,
          ntbUnitSold: 0,
          ntbRevenue: 0,
        });
      }
      const agg = byAsin.get(key);
      const dateKey = parseDateKey(doc.Date || doc.date || doc.DATE);
      if (dateKey && (!agg.latestDateKey || dateKey > agg.latestDateKey)) {
        agg.latestDateKey = dateKey;
        agg.availableInventoryLatest = parseNum(doc['Available Inventory'] ?? doc.available_inventory);
        agg.dosLatest = parseNum(doc.DOS ?? doc.dos);
      }
      agg.impressions += parseNum(doc.Impressions ?? doc.impressions);
      agg.clicks += parseNum(doc.Clicks ?? doc.clicks);
      agg.adSpend += parseNum(doc.ads_spend);
      agg.adUnitSold += parseNum(doc.ads_unit_sold);
      agg.adSales += parseNum(doc.ads_sales);
      agg.overallUnitSold += parseNum(doc.total_units);
      agg.overallRevenue += parseNum(doc.total_sales);
      agg.last30Sales += parseNum(doc.total_sales);
    });

    const skuRows = Array.from(byAsin.values()).map((r, idx) => {
      const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
      const cpc = r.clicks > 0 ? r.adSpend / r.clicks : 0;
      const cvr = r.clicks > 0 ? (r.overallUnitSold / r.clicks) * 100 : 0;
      const acos = r.adSales > 0 ? (r.adSpend / r.adSales) * 100 : 0;
      const tacos = r.overallRevenue > 0 ? (r.adSpend / r.overallRevenue) * 100 : 0;
      const organicUnitSold = Math.max(0, r.overallUnitSold - r.adUnitSold);
      const organicRevenue = Math.max(0, r.overallRevenue - r.adSales);

      return {
        id: `${r.asin}-${idx}`,
        asin: r.asin,
        productName: r.productName,
        productCategory: r.productCategory,
        packSize: r.packSize,
        salesChannel: r.salesChannel,
        date: r.latestDateKey || '—',
        availableInventory: r.availableInventoryLatest,
        last30Sales: Math.round(r.last30Sales * 100) / 100,
        dos: r.dosLatest,
        impressions: r.impressions,
        clicks: r.clicks,
        // For the "Other Columns" picker (strings must match OTHER_COLUMNS exactly)
        Date: r.latestDateKey || '—',
        'Available Inventory': r.availableInventoryLatest,
        'Last 30 Days Sales': Math.round(r.last30Sales * 100) / 100,
        DOS: r.dosLatest,
        Impressions: r.impressions,
        Clicks: r.clicks,
        CTR: Math.round(ctr * 100) / 100,
        CPC: Math.round(cpc * 100) / 100,
        CVR: Math.round(cvr * 100) / 100,
        'Ad Spend': Math.round(r.adSpend * 100) / 100,
        'Ad Unit Sold': r.adUnitSold,
        'Ad Sales': Math.round(r.adSales * 100) / 100,
        ACoS: Math.round(acos * 100) / 100,
        'Overall Unit Sold': r.overallUnitSold,
        'Overall Revenue': Math.round(r.overallRevenue * 100) / 100,
        TACoS: Math.round(tacos * 100) / 100,
        'Organic Unit Sold': organicUnitSold,
        'Organic Revenue': Math.round(organicRevenue * 100) / 100,
        'NTB Unit Sold': 0,
        'NTB Revenue': 0,
        // Numeric helpers for sorting / filtering
        overallRevenue: r.overallRevenue,
        overallUnitSold: r.overallUnitSold,
      };
    });

    // Aggregate Campaign-level rows (by Campaign Name) for Detailed Campaign Level Marketing View
    const byCampaign = new Map();
    docsForCampaign.forEach((doc) => {
      const cleanDim = (value, fallback) => {
        const s = String(value ?? '').trim();
        if (!s || s === '0' || s.toLowerCase() === 'null') return fallback;
        return s;
      };

      const name = cleanDim(
        doc['Campaign Name'] ?? doc.campaign_name ?? doc.campaignName,
        'Unattributed',
      );
      const type = cleanDim(
        doc['Campaign Type'] ?? doc.campaign_type ?? doc.campaignType,
        'Unattributed',
      );
      const portfolio = cleanDim(
        doc['Portfolio name'] ?? doc.portfolio_name ?? doc.portfolio,
        'Unattributed',
      );
      const salesChannel =
        doc['Sales Channel'] ??
        doc.sales_channel ??
        doc.salesChannel ??
        doc.channel ??
        '';
      // Include channel + type in the key so different channels don't merge into one campaign.
      const keyParts = [
        String(name || '').trim() || `UNKNOWN_${type}`,
        String(type || '').trim(),
        String(salesChannel || '').trim(),
      ];
      const key = keyParts.join('||');
      if (!byCampaign.has(key)) {
        byCampaign.set(key, {
          campaignName: name,
          campaignType: type,
          portfolio,
          salesChannel,
          impressions: 0,
          clicks: 0,
          adSpend: 0,
          adUnitSold: 0,
          adSales: 0,
          overallUnitSold: 0,
          overallRevenue: 0,
        });
      }
      const agg = byCampaign.get(key);
      agg.impressions += parseNum(doc.Impressions ?? doc.impressions);
      agg.clicks += parseNum(doc.Clicks ?? doc.clicks);
      agg.adSpend += parseNum(doc.ads_spend);
      agg.adUnitSold += parseNum(doc.ads_unit_sold);
      agg.adSales += parseNum(doc.ads_sales);
      agg.overallUnitSold += parseNum(doc.total_units);
      agg.overallRevenue += parseNum(doc.total_sales);
    });

    const campaignRows = Array.from(byCampaign.values()).map((r, idx) => {
      const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
      const cpc = r.clicks > 0 ? r.adSpend / r.clicks : 0;
      const cvr = r.clicks > 0 ? (r.overallUnitSold / r.clicks) * 100 : 0;
      const acos = r.adSales > 0 ? (r.adSpend / r.adSales) * 100 : 0;
      const tacos = r.overallRevenue > 0 ? (r.adSpend / r.overallRevenue) * 100 : 0;
      const organicUnitSold = Math.max(0, r.overallUnitSold - r.adUnitSold);
      const organicRevenue = Math.max(0, r.overallRevenue - r.adSales);

      return {
        id: `${r.campaignName}-${r.salesChannel || 'UNKNOWN'}-${idx}`,
        campaignType: r.campaignType,
        campaignName: r.campaignName,
        portfolio: r.portfolio,
        salesChannel: r.salesChannel,
        impressions: r.impressions,
        clicks: r.clicks,
        CTR: Math.round(ctr * 100) / 100,
        CPC: Math.round(cpc * 100) / 100,
        CVR: Math.round(cvr * 100) / 100,
        'Ad Spend': Math.round(r.adSpend * 100) / 100,
        'Ad Unit Sold': r.adUnitSold,
        'Ad Sales': Math.round(r.adSales * 100) / 100,
        ACoS: Math.round(acos * 100) / 100,
        'Overall Unit Sold': r.overallUnitSold,
        'Overall Revenue': Math.round(r.overallRevenue * 100) / 100,
        TACoS: Math.round(tacos * 100) / 100,
        'Organic Unit Sold': organicUnitSold,
        'Organic Revenue': Math.round(organicRevenue * 100) / 100,
        'NTB Unit Sold': 0,
        'NTB Revenue': 0,
        // numeric helper for revenue sort
        overallRevenueValue: r.overallRevenue,
      };
    });

    // Aggregate by calendar date (YYYY-MM-DD string from `Date` field) – overall (top filters).
    const byDate = new Map();

    let totalCost = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalUnits = 0;
    let totalSales = 0;
    let totalAdSales = 0;
    let totalAdUnits = 0;

    docsForCurrent.forEach((doc) => {
      const dateKey = parseDateKey(doc.Date || doc.date || doc.DATE) || 'UNKNOWN';

      const impressions = parseNum(doc.Impressions ?? doc.impressions);
      const clicks = parseNum(doc.Clicks ?? doc.clicks);
      const cost = parseNum(doc.ads_spend);
      const sales = parseNum(doc.total_sales);
      const units = parseNum(doc.total_units);
      const adSales = parseNum(doc.ads_sales);
      const adUnits = parseNum(doc.ads_unit_sold);

      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, {
          dateKey,
          totalCost: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          adSales: 0,
          adUnits: 0,
          sales: 0,
          units: 0,
        });
      }

      const agg = byDate.get(dateKey);
      agg.totalCost += cost;
      agg.impressions += impressions;
      agg.clicks += clicks;
      agg.purchases += units;
      agg.adSales += adSales;
      agg.adUnits += adUnits;
      agg.sales += sales;
      agg.units += units;

      totalCost += cost;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalUnits += units;
      totalSales += sales;
      totalAdSales += adSales;
      totalAdUnits += adUnits;
    });

    // Comparison aggregation (same KPIs as above)
    let prevTotalCost = 0;
    let prevTotalUnits = 0;
    let prevTotalSales = 0;
    let prevTotalAdSales = 0;
    let prevTotalAdUnits = 0;

    if (docsForComparison.length) {
      docsForComparison.forEach((doc) => {
        prevTotalCost += parseNum(doc.ads_spend);
        prevTotalSales += parseNum(doc.total_sales);
        prevTotalUnits += parseNum(doc.total_units);
        prevTotalAdSales += parseNum(doc.ads_sales);
        prevTotalAdUnits += parseNum(doc.ads_unit_sold);
      });
    }

    // Build chart data sorted by date (overall).
    const chartData = Array.from(byDate.values())
      .sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1))
      .map((entry) => {
        const dateLabel =
          entry.dateKey && entry.dateKey !== 'UNKNOWN'
            ? toDDMonYY(entry.dateKey)
            : entry.dateKey;

        const roas = entry.totalCost > 0 ? entry.sales / entry.totalCost : 0;
        const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
        const cpc = entry.clicks > 0 ? entry.totalCost / entry.clicks : 0;
        const cvr = entry.clicks > 0 ? (entry.purchases / entry.clicks) * 100 : 0;
        const acos = entry.sales > 0 ? (entry.totalCost / entry.sales) * 100 : 0;
        const tacos = entry.sales > 0 ? (entry.totalCost / entry.sales) * 100 : 0;
        const organicUnitSold = Math.max(0, entry.units - entry.adUnits);
        const organicRevenue = Math.max(0, entry.sales - entry.adSales);

        return {
          // X-axis label
          month: dateLabel,
          // Left axis – currency
          totalCost: entry.totalCost,
          adSpend: entry.totalCost,
          overallRevenue: entry.sales,
          adSales: entry.adSales,
          organicRevenue,
          ntbRevenue: 0,
          // Right axis – counts / ratios
          impressions: entry.impressions,
          clicks: entry.clicks,
          purchases: entry.purchases,
          adUnitSold: entry.adUnits,
          overallUnitSold: entry.units,
          organicUnitSold,
          ntbUnitSold: 0,
          ctr,
          cpc,
          cvr,
          acos,
          tacos,
          // Extra metric for tooltip if needed
          roas,
        };
      });

    // Campaign-level chart data (using campaign filters)
    const byDateCampaign = new Map();

    docsForCampaign.forEach((doc) => {
      const dateKey = parseDateKey(doc.Date || doc.date || doc.DATE) || 'UNKNOWN';

      const impressions = parseNum(doc.Impressions ?? doc.impressions);
      const clicks = parseNum(doc.Clicks ?? doc.clicks);
      const cost = parseNum(doc.ads_spend);
      const sales = parseNum(doc.total_sales);
      const units = parseNum(doc.total_units);
      const adSales = parseNum(doc.ads_sales);
      const adUnits = parseNum(doc.ads_unit_sold);

      if (!byDateCampaign.has(dateKey)) {
        byDateCampaign.set(dateKey, {
          dateKey,
          totalCost: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          adSales: 0,
          adUnits: 0,
          sales: 0,
          units: 0,
        });
      }

      const agg = byDateCampaign.get(dateKey);
      agg.totalCost += cost;
      agg.impressions += impressions;
      agg.clicks += clicks;
      agg.purchases += units;
      agg.adSales += adSales;
      agg.adUnits += adUnits;
      agg.sales += sales;
      agg.units += units;
    });

    const campaignChartData = Array.from(byDateCampaign.values())
      .sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1))
      .map((entry) => {
        const dateLabel =
          entry.dateKey && entry.dateKey !== 'UNKNOWN'
            ? toDDMonYY(entry.dateKey)
            : entry.dateKey;

        const roas = entry.totalCost > 0 ? entry.sales / entry.totalCost : 0;
        const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
        const cpc = entry.clicks > 0 ? entry.totalCost / entry.clicks : 0;
        const cvr = entry.clicks > 0 ? (entry.purchases / entry.clicks) * 100 : 0;
        const acos = entry.sales > 0 ? (entry.totalCost / entry.sales) * 100 : 0;
        const tacos = entry.sales > 0 ? (entry.totalCost / entry.sales) * 100 : 0;
        const organicUnitSold = Math.max(0, entry.units - entry.adUnits);
        const organicRevenue = Math.max(0, entry.sales - entry.adSales);

        return {
          month: dateLabel,
          totalCost: entry.totalCost,
          adSpend: entry.totalCost,
          overallRevenue: entry.sales,
          adSales: entry.adSales,
          organicRevenue,
          ntbRevenue: 0,
          impressions: entry.impressions,
          clicks: entry.clicks,
          purchases: entry.purchases,
          adUnitSold: entry.adUnits,
          overallUnitSold: entry.units,
          organicUnitSold,
          ntbUnitSold: 0,
          ctr,
          cpc,
          cvr,
          acos,
          tacos,
          roas,
        };
      });

    const overallRoas = totalCost > 0 ? totalSales / totalCost : 0;
    const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const overallCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const overallCvr = totalClicks > 0 ? (totalUnits / totalClicks) * 100 : 0;
    const overallAcos = totalSales > 0 ? (totalCost / totalSales) * 100 : 0;
    const overallTacos = totalSales > 0 ? (totalCost / totalSales) * 100 : 0;

    const adRevenuePerUnit = totalAdUnits > 0 ? totalAdSales / totalAdUnits : 0;
    const overallRevenuePerUnit = totalUnits > 0 ? totalSales / totalUnits : 0;
    const acos = totalAdSales > 0 ? (totalCost / totalAdSales) * 100 : 0;

    const metrics = {
      // These IDs line up with PERFORMANCE_METRIC_OPTIONS in the frontend.
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: overallCtr,
      cpc: overallCpc,
      cvr: overallCvr,
      adSpend: totalCost,
      adRevenuePerUnit,
      overallRevenuePerUnit,
      acos: Math.round(acos * 100) / 100,
      adUnitSold: totalAdUnits,
      adSales: totalAdSales,
      // keep existing aggregate ACoS for other uses (legacy)
      legacyAcos: overallAcos,
      overallUnitSold: totalUnits,
      overallRevenue: totalSales,
      tacos: overallTacos,
      // Organic / NTB left as zero for now – can be refined later.
      organicUnitSold: Math.max(0, totalUnits - totalAdUnits),
      organicRevenue: Math.max(0, totalSales - totalAdSales),
      ntbUnitSold: 0,
      ntbRevenue: 0,
    };

    let comparison = null;
    if (periods) {
      const prevAdRevenuePerUnit = prevTotalAdUnits > 0 ? prevTotalAdSales / prevTotalAdUnits : 0;
      const prevOverallRevenuePerUnit = prevTotalUnits > 0 ? prevTotalSales / prevTotalUnits : 0;
      const prevAcos = prevTotalAdSales > 0 ? (prevTotalCost / prevTotalAdSales) * 100 : 0;
      const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
      comparison = {
        adSpend: { pctChange: fmt(pctChange(totalCost, prevTotalCost)) },
        adRevenuePerUnit: { pctChange: fmt(pctChange(adRevenuePerUnit, prevAdRevenuePerUnit)) },
        overallRevenuePerUnit: { pctChange: fmt(pctChange(overallRevenuePerUnit, prevOverallRevenuePerUnit)) },
        overallRevenue: { pctChange: fmt(pctChange(totalSales, prevTotalSales)) },
        acos: { pctChange: fmt(pctChange(acos, prevAcos)) },
      };
    }

    const latestDoc = (docsFiltered.length ? docsFiltered : docs).reduce((latest, cur) => {
      const curDate = cur.Date ? new Date(cur.Date) : null;
      if (!curDate) return latest;
      if (!latest) return cur;
      const latestDate = latest.Date ? new Date(latest.Date) : null;
      if (!latestDate) return cur;
      return curDate > latestDate ? cur : latest;
    }, null);

    const updatedAt = latestDoc?.Date ? new Date(latestDoc.Date).toISOString() : new Date().toISOString();

    // Campaign-level metrics (using docsForCampaign)
    let campaignTotalCost = 0;
    let campaignTotalUnits = 0;
    let campaignTotalSales = 0;
    let campaignTotalAdSales = 0;
    let campaignTotalAdUnits = 0;

    docsForCampaign.forEach((doc) => {
      campaignTotalCost += parseNum(doc.ads_spend);
      campaignTotalSales += parseNum(doc.total_sales);
      campaignTotalUnits += parseNum(doc.total_units);
      campaignTotalAdSales += parseNum(doc.ads_sales);
      campaignTotalAdUnits += parseNum(doc.ads_unit_sold);
    });

    const campaignAdRevenuePerUnit = campaignTotalAdUnits > 0 ? campaignTotalAdSales / campaignTotalAdUnits : 0;
    const campaignOverallRevenuePerUnit = campaignTotalUnits > 0 ? campaignTotalSales / campaignTotalUnits : 0;
    const campaignAcosValue = campaignTotalAdSales > 0 ? (campaignTotalCost / campaignTotalAdSales) * 100 : 0;

    const campaignMetrics = {
      adSpend: campaignTotalCost,
      adRevenuePerUnit: campaignAdRevenuePerUnit,
      overallRevenuePerUnit: campaignOverallRevenuePerUnit,
      acos: Math.round(campaignAcosValue * 100) / 100,
    };

    const payload = {
      title: 'Marketing',
      metrics,
      chartData,
      funnelMetrics: [],
      skuRows,
      campaignMetrics,
      campaignRows,
      campaignChartData,
      salesChannelOptions,
      updatedAt,
      ...(comparison && { comparison }),
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching marketing data:', error);
    res.status(500).json({ message: 'Failed to fetch marketing data' });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    // Bump cache key version so category field fixes apply immediately.
    const cacheKey = buildDashboardCacheKey(req, 'inventory:v4');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    // Avoid loading the entire `inventories` collection into memory.
    // Inventory UI selects a single day via `customRangeStart/customRangeEnd`.
    const reqCustomRangeStart = req.query.customRangeStart || '';
    const reqCustomRangeEnd = req.query.customRangeEnd || '';
    const reqDateFilterType = req.query.dateFilterType || '';

    let docsFilter = {};

    if (reqCustomRangeStart) {
      const selectedKey = parseDateKey(reqCustomRangeStart);
      const endKey = parseDateKey(reqCustomRangeEnd) || selectedKey;

      if (selectedKey) {
        if (selectedKey === endKey) {
          docsFilter = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], selectedKey);
        } else {
          const startDate = new Date(selectedKey);
          const endDate = new Date(endKey);
          if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
            const days = dateList(startDate, endDate);
            const clauses = [];
            days.forEach((dayKey) => {
              const q = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], dayKey);
              if (q?.$or?.length) clauses.push(...q.$or);
            });
            if (clauses.length) docsFilter = { $or: clauses };
          }
        }
      }
    } else if (reqDateFilterType) {
      // Fallback if Inventory UI changes to use dateFilterType
      const periodsForDocs = getPeriodMonths(reqDateFilterType, reqCustomRangeStart, reqCustomRangeEnd);
      if (periodsForDocs) {
        const allowedMonths = [...periodsForDocs.current, ...periodsForDocs.comparison];
        const monthOr = [];
        allowedMonths.forEach((ym) => {
          if (!ym || typeof ym !== 'string' || ym.length < 7) return;
          const year4 = parseInt(ym.slice(0, 4), 10);
          const ymShort = monthShortFromYearMonth(ym);
          const yearYY = String(year4).slice(-2);
          const isoMonthPrefix = `${ym}-`;
          monthOr.push({ Date: { $regex: `^${isoMonthPrefix}` } });
          monthOr.push({ date: { $regex: `^${isoMonthPrefix}` } });
          monthOr.push({ DATE: { $regex: `^${isoMonthPrefix}` } });
          monthOr.push({ 'Date ': { $regex: `^${isoMonthPrefix}` } });
          if (ymShort) {
            const re1 = new RegExp(`^\\\\d{1,2}-${ymShort}-${year4}`, 'i');
            const re2 = new RegExp(`^\\\\d{1,2}-${ymShort}-${yearYY}`, 'i');
            monthOr.push({ Date: { $regex: re1 } });
            monthOr.push({ date: { $regex: re1 } });
            monthOr.push({ DATE: { $regex: re1 } });
            monthOr.push({ 'Date ': { $regex: re1 } });
            monthOr.push({ Date: { $regex: re2 } });
            monthOr.push({ date: { $regex: re2 } });
            monthOr.push({ DATE: { $regex: re2 } });
            monthOr.push({ 'Date ': { $regex: re2 } });
          }
        });
        if (monthOr.length) docsFilter = { $or: monthOr };
      }
    }

    const docs = await req.companyModels.Inventory.find(Object.keys(docsFilter).length ? docsFilter : {}).lean();

    const rows = docs.map((doc, index) => {
      const availableInventory = Number(doc['Available Inventory'] ?? doc.available_inventory ?? doc.availableInventory ?? 0);
      const last30DaysSales = Number(doc.total_sales ?? 0);
      const dos = Number(doc.DOS ?? doc.dos ?? 0);
      const instockRate = Number(doc['Instock Rate'] ?? doc.instock_rate ?? 0);
      const openPos = Number(doc['Open POs'] ?? doc.open_pos ?? 0);
      const noLowStockWithOpenPos = Number(doc['No/Low Stock wt Open POs'] ?? doc['no/low_stock_wt_open_pos'] ?? 0);
      const noLowStockNoOpenPos = Number(doc['No/Low Stock wt no Open POs'] ?? doc['no/low_stock_wt_no_open_pos'] ?? 0);
      const stockStatus = doc.Stock_Status || doc.stock_status || '';
      const salesChannel = doc.sales_channel ?? doc.salesChannel ?? revenueChannelFromDoc(doc) ?? '';
      const reportDate = parseDateKey(
        getFieldValueLoose(doc, 'Date') ??
        getFieldValueLoose(doc, 'date') ??
        getFieldValueLoose(doc, 'DATE') ??
        getFieldValueLoose(doc, 'Date '),
      );
      const reportMonth = reportDate ? reportDate.slice(0, 7) : '';
      const oosDateValue = doc['OOS Date'] ?? doc.OOS_Date ?? getFieldValueLoose(doc, 'Date') ?? '';
      // Category fields can have messy keys (NBSP, casing, underscores). Prefer snake_case,
      // but fall back to "loose" header matching for CSV-imported columns.
      const productCategory =
        doc.product_category ??
        doc.product_sub_category ??
        getFieldValueLoose(doc, 'Product Category') ??
        getFieldValueLoose(doc, 'Product Sub Category') ??
        doc['Product Category'] ??
        doc['Product Sub Category'] ??
        doc.productCategory ??
        doc.productSubCategory ??
        '';
      const packSizeRaw =
        doc.pack_size ??
        doc['Pack Size'] ??
        doc.Pack_Size ??
        doc.packSize ??
        '';
      const packSize = packSizeRaw != null ? String(packSizeRaw) : '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.asin ?? revenueAsinFromDoc(doc) ?? '',
        productName: doc.product_name ?? doc.productName ?? revenueProductNameFromDoc(doc) ?? '',
        // Keep legacy `category` (used by UI filters), but source from canonical `product_category`.
        category: productCategory || 'UNKNOWN',
        product_category: productCategory,
        packSize,
        pack_size: packSize,
        channel: salesChannel,
        sales_channel: salesChannel,
        available: availableInventory,
        last30DaysSales,
        dos,
        instockRate,
        openPos,
        oosDate: oosDateValue,
        reportDate,
        status: stockStatus,
        noLowStockWithOpenPos,
        noLowStockNoOpenPos,
        isLowStock:
          stockStatus === 'Low Stock' ||
          stockStatus === 'Critical' ||
          (typeof stockStatus === 'string' && stockStatus.toLowerCase().includes('low stock')),
        hasOpenPo: openPos > 0,
        reportMonth,
      };
    });

    // Latest data date for Inventory – for "Data updated as of". Use parseDateKey so DD-MMM-YYYY (e.g. "13-Mar-2026") is ordered correctly.
    const latestInventoryDoc = docs.reduce((latest, cur) => {
      const curKey = parseDateKey(cur.Date || cur.date || cur.DATE);
      if (!curKey) return latest;
      if (!latest) return cur;
      const latestKey = parseDateKey(latest.Date || latest.date || latest.DATE);
      if (!latestKey) return cur;
      return curKey >= latestKey ? cur : latest;
    }, null);
    const latestInvStr = latestInventoryDoc?.Date || latestInventoryDoc?.date || latestInventoryDoc?.DATE;
    const updatedAt = latestInvStr
      ? (parseDateKey(latestInvStr)
        ? new Date(parseDateKey(latestInvStr) + 'T12:00:00.000Z').toISOString()
        : new Date(latestInvStr).toISOString())
      : new Date().toISOString();

    const dateFilterType = req.query.dateFilterType || '';
    const customRangeStart = req.query.customRangeStart || '';
    const customRangeEnd = req.query.customRangeEnd || '';
    let comparison = null;

    if (dateFilterType) {
      const periods = getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd);
      if (periods) {
        const currentSet = new Set(periods.current);
        const comparisonSet = new Set(periods.comparison);
        const currentRows = rows.filter((r) => r.reportMonth && currentSet.has(r.reportMonth));
        const comparisonRows = rows.filter((r) => r.reportMonth && comparisonSet.has(r.reportMonth));
        const curr = aggregateInventoryRows(currentRows);
        const prev = aggregateInventoryRows(comparisonRows);

        const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

        comparison = {
          available: { pctChange: fmt(pctChange(curr.totalAvailable, prev.totalAvailable)) },
          last30Sales: { pctChange: fmt(pctChange(curr.last30Sales, prev.last30Sales)) },
          dos: { pctChange: fmt(pctChange(curr.avgDos, prev.avgDos)) },
          instockRate: { pctChange: fmt(pctChange(curr.instockRate, prev.instockRate)) },
        };
      }
    } else if (customRangeStart) {
      // Day-level comparison: selected day vs previous day.
      const selectedKey = parseDateKey(customRangeStart);
      if (selectedKey) {
        const selectedDate = new Date(selectedKey);
        if (!Number.isNaN(selectedDate.getTime())) {
          const prevDate = new Date(selectedDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevKey = toYmd(prevDate);

          const rowDateKey = (r) => r.reportDate || parseDateKey(r.oosDate);

          const currentRows = rows.filter((r) => rowDateKey(r) === selectedKey);
          const comparisonRows = rows.filter((r) => rowDateKey(r) === prevKey);

          const curr = aggregateInventoryRows(currentRows);
          const prev = aggregateInventoryRows(comparisonRows);

          const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

          comparison = {
            available: { pctChange: fmt(pctChange(curr.totalAvailable, prev.totalAvailable)) },
            last30Sales: { pctChange: fmt(pctChange(curr.last30Sales, prev.last30Sales)) },
            dos: { pctChange: fmt(pctChange(curr.avgDos, prev.avgDos)) },
            instockRate: { pctChange: fmt(pctChange(curr.instockRate, prev.instockRate)) },
          };
        }
      }
    }

    const payload = {
      title: 'Inventory',
      rows,
      total: rows.length,
      updatedAt,
      ...(comparison && { comparison }),
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    res.status(500).json({ message: 'Failed to fetch inventory data' });
  }
});

router.get('/buybox', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'buybox');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    // Avoid loading the entire `buyboxes` collection into memory.
    const reqDateFilterType = req.query.dateFilterType || '';
    const reqCustomRangeStart = req.query.customRangeStart || '';
    const reqCustomRangeEnd = req.query.customRangeEnd || '';

    let docsFilter = {};
    if (reqCustomRangeStart) {
      const selectedKey = parseDateKey(reqCustomRangeStart);
      const endKey = parseDateKey(reqCustomRangeEnd) || selectedKey;

      if (selectedKey) {
        if (selectedKey === endKey) {
          docsFilter = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], selectedKey);
        } else {
          const startDate = new Date(selectedKey);
          const endDate = new Date(endKey);
          if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
            const days = dateList(startDate, endDate);
            const clauses = [];
            days.forEach((dayKey) => {
              const q = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], dayKey);
              if (q?.$or?.length) clauses.push(...q.$or);
            });
            if (clauses.length) docsFilter = { $or: clauses };
          }
        }
      }
    } else if (reqDateFilterType) {
      const dayWeekPeriods = getPeriodDaysOrWeeks(reqDateFilterType);
      if (dayWeekPeriods) {
        const allowedDays = [...dayWeekPeriods.current, ...dayWeekPeriods.comparison];
        const clauses = [];
        allowedDays.forEach((dayKey) => {
          const q = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], dayKey);
          if (q?.$or?.length) clauses.push(...q.$or);
        });
        if (clauses.length) docsFilter = { $or: clauses };
      } else {
        const periods = getPeriodMonths(reqDateFilterType, reqCustomRangeStart, reqCustomRangeEnd);
        if (periods) {
          const allowedMonths = [...periods.current, ...periods.comparison];
          const monthOr = [];
          allowedMonths.forEach((ym) => {
            if (!ym || typeof ym !== 'string' || ym.length < 7) return;
            const year4 = parseInt(ym.slice(0, 4), 10);
            const ymShort = monthShortFromYearMonth(ym);
            const yearYY = String(year4).slice(-2);
            const isoMonthPrefix = `${ym}-`;
            monthOr.push({ Date: { $regex: `^${isoMonthPrefix}` } });
            monthOr.push({ date: { $regex: `^${isoMonthPrefix}` } });
            monthOr.push({ DATE: { $regex: `^${isoMonthPrefix}` } });
            monthOr.push({ 'Date ': { $regex: `^${isoMonthPrefix}` } });
            if (ymShort) {
              const re1 = new RegExp(`^\\\\d{1,2}-${ymShort}-${year4}`, 'i');
              const re2 = new RegExp(`^\\\\d{1,2}-${ymShort}-${yearYY}`, 'i');
              monthOr.push({ Date: { $regex: re1 } });
              monthOr.push({ date: { $regex: re1 } });
              monthOr.push({ DATE: { $regex: re1 } });
              monthOr.push({ 'Date ': { $regex: re1 } });
              monthOr.push({ Date: { $regex: re2 } });
              monthOr.push({ date: { $regex: re2 } });
              monthOr.push({ DATE: { $regex: re2 } });
              monthOr.push({ 'Date ': { $regex: re2 } });
            }
          });
          if (monthOr.length) docsFilter = { $or: monthOr };
        }
      }
    }

    const docs = await req.companyModels.Buybox.find(docsFilter).lean();

    // Unique Sales Channel values from entire collection (for dropdown, not limited by date filter)
    const salesChannelSet = new Set();
    docs.forEach((doc) => {
      const val = revenueChannelFromDoc(doc);
      if (val) salesChannelSet.add(String(val).trim());
    });
    const salesChannelOptions = Array.from(salesChannelSet).sort((a, b) => String(a).localeCompare(String(b)));

    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const instockRate = parseNum(doc['Instock Rate'] ?? doc.instock_rate);
      const availableInventory = parseNum(doc['Available Inventory'] ?? doc.available_inventory);
      const dos = parseNum(doc.DOS ?? doc.dos);
      const openPos = parseNum(doc['Open POs'] ?? doc.open_pos);
      const reportDate = parseDateKey(
        getFieldValueLoose(doc, 'Date') ??
        getFieldValueLoose(doc, 'date') ??
        getFieldValueLoose(doc, 'DATE') ??
        getFieldValueLoose(doc, 'Date '),
      );
      const reportMonth = reportDate ? reportDate.slice(0, 7) : '';
      const buyboxOwner =
        doc['Current Owner'] ?? doc['Current Owner '] ?? doc.CurrentOwner ?? doc.currentOwner ?? doc.current_owner ?? doc.BuyBox ?? '';
      const hasBuybox =
        typeof buyboxOwner === 'string'
          ? buyboxOwner.trim().toLowerCase() !== 'no' && buyboxOwner.trim() !== ''
          : Boolean(buyboxOwner);

      return {
        // identifiers
        _id: doc._id?.toString() || String(index + 1),
        id: doc._id?.toString() || String(index + 1),
        // core product fields
        asin: revenueAsinFromDoc(doc) || '',
        productName: revenueProductNameFromDoc(doc) || '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? doc.product_category ?? doc.product_sub_category ?? '',
        brand: doc.Brand ?? doc.brand ?? '',
        productSubCategory: doc['Product Sub Category'] ?? doc.product_sub_category ?? '',
        packSize: doc['Pack Size'] ?? doc.pack_size != null ? String(doc['Pack Size'] ?? doc.pack_size) : '',
        salesChannel: revenueChannelFromDoc(doc) || '',
        packType: doc['Pack Type'] ?? doc.pack_type ?? '',
        reportMonth,
        reportDate,
        // inventory & sales metrics
        availableInventory,
        last30DaysSales: totalSales,
        dos,
        instockRate,
        openPos,
        oosDate: doc['OOS Date'] ?? doc.OOS_Date ?? doc.oos_date ?? '',
        stockStatus: doc.Stock_Status || doc.stock_status || '',
        totalUnits,
        totalSales,
        sellThrough: parseNum(doc.sell_through),
        aged90Amount: parseNum(doc['Aged 90+ Days Sellable Inventory'] ?? doc['aged_90+_days_sellable_inventory']),
        aged90Units: parseNum(doc['Aged 90+ Days Sellable Units'] ?? doc['aged_90+_days_sellable_units']),
        sellableInventoryAmount: parseNum(doc['Sellable Inventory Amount'] ?? doc.sellable_inventory_amount),
        unsellableOnHandAmount: parseNum(doc['Unsellable On Hand Inventory Amount'] ?? doc.unsellable_on_hand_inventory_amount),
        unsellableOnHandUnits: parseNum(doc['Unsellable On Hand Units'] ?? doc.unsellable_on_hand_units),
        inStockFlag: doc.in_stock_flag,
        cumulativeInstockDays: parseNum(doc.cumulative_instock_days),
        dayOfMonth: parseNum(doc.day_of_month),
        minAvailableQty: parseNum(doc.min_available_qty),
        maxAvailableQty: parseNum(doc.max_available_qty),
        hasBuybox,
        currentBuyboxOwner: buyboxOwner,
        currentBuyboxPrice: doc.Price ?? doc['Current Owner Price'] ?? null,
        currentVcPrice: doc['VC Ideal Price'] ?? null,
        currentScPrice: doc['SC Ideal Price'] ?? null,
        // direct mirrors of raw buybox sheet columns for UI table
        Brand: doc.Brand ?? doc.brand ?? '',
        'Product Sub Category': doc['Product Sub Category'] ?? doc.product_sub_category ?? '',
        'Vendor Confirmation %': doc['Vendor Confirmation %'] ?? doc['vendor_confirmation_%'] ?? '',
        PO_received_amount: doc.PO_received_amount ?? doc.PO_received_amt ?? doc.po_received_amount ?? '',
        PO_received_Units: doc.PO_received_Units ?? doc.po_received_units ?? '',
        'Open POs': doc['Open POs'] ?? doc.open_pos ?? '',
        Receive_Fill_Rate: doc.Receive_Fill_Rate ?? doc.receive_fill_rate ?? '',
        'Overall Vendor Lead Time (days)': doc['Overall Vendor Lead Time (days)'] ?? doc['overall_vendor_lead_time_(days)'] ?? '',
        'Aged 90+ Days Sellable Inventory': doc['Aged 90+ Days Sellable Inventory'] ?? doc['aged_90+_days_sellable_inventory'] ?? '',
        'Aged 90+ Days Sellable Units': doc['Aged 90+ Days Sellable Units'] ?? doc['aged_90+_days_sellable_units'] ?? '',
        'Sellable Inventory Amount': doc['Sellable Inventory Amount'] ?? doc.sellable_inventory_amount ?? '',
        'Available Inventory': doc['Available Inventory'] ?? doc.available_inventory ?? '',
        'Unsellable On Hand Inventory Amount': doc['Unsellable On Hand Inventory Amount'] ?? doc.unsellable_on_hand_inventory_amount ?? '',
        'Unsellable On Hand Units': doc['Unsellable On Hand Units'] ?? doc.unsellable_on_hand_units ?? '',
        Date: doc.Date ?? doc.date ?? doc.DATE ?? '',
        'Sales Channel': doc['Sales Channel'] ?? doc.sales_channel ?? '',
        in_stock_flag: doc.in_stock_flag ?? '',
        cumulative_instock_days: doc.cumulative_instock_days ?? '',
        day_of_month: doc.day_of_month ?? '',
        'Instock Rate': doc['Instock Rate'] ?? doc.instock_rate ?? '',
        'OOS Date': doc['OOS Date'] ?? doc.OOS_Date ?? doc.oos_date ?? '',
        total_sales: doc.total_sales ?? '',
        total_units: doc.total_units ?? '',
        sell_through: doc.sell_through ?? '',
        DOS: doc.DOS ?? doc.dos ?? '',
        min_available_qty: doc.min_available_qty ?? '',
        max_available_qty: doc.max_available_qty ?? '',
        Stock_Status: doc.Stock_Status ?? doc.stock_status ?? '',
        'No/Low Stock wt Open POs': doc['No/Low Stock wt Open POs'] ?? doc['no/low_stock_wt_open_pos'] ?? '',
        'No/Low Stock wt no Open POs': doc['No/Low Stock wt no Open POs'] ?? doc['no/low_stock_wt_no_open_pos'] ?? '',
        'Product Name': doc['Product Name'] ?? doc.product_name ?? '',
        'Pack Type': doc['Pack Type'] ?? doc.pack_type ?? '',
        'SC Ideal Price': doc['SC Ideal Price'] ?? doc.sc_ideal_price ?? '',
        'VC Ideal Price': doc['VC Ideal Price'] ?? doc.vc_ideal_price ?? '',
        'Product Category': doc['Product Category'] ?? doc.product_category ?? '',
        'Current Owner': buyboxOwner,
        'Current Owner Price': doc['Current Owner Price'] ?? doc.current_owner_price ?? '',
        'Current Owner MOQ': doc['Current Owner MOQ'] ?? '',
        // hijackers 1–10 (name, price, MOQ)
        'Hijacker 1': doc['Hijacker 1'] ?? '',
        'Hijacker 1 Price': doc['Hijacker 1 Price'] ?? '',
        'Hijacker 1 MOQ': doc['Hijacker 1 MOQ'] ?? '',
        'Hijacker 2': doc['Hijacker 2'] ?? '',
        'Hijacker 2 Price': doc['Hijacker 2 Price'] ?? '',
        'Hijacker 2 MOQ': doc['Hijacker 2 MOQ'] ?? '',
        'Hijacker 3': doc['Hijacker 3'] ?? '',
        'Hijacker 3 Price': doc['Hijacker 3 Price'] ?? '',
        'Hijacker 3 MOQ': doc['Hijacker 3 MOQ'] ?? '',
        'Hijacker 4': doc['Hijacker 4'] ?? '',
        'Hijacker 4 Price': doc['Hijacker 4 Price'] ?? '',
        'Hijacker 4 MOQ': doc['Hijacker 4 MOQ'] ?? '',
        'Hijacker 5': doc['Hijacker 5'] ?? '',
        'Hijacker 5 Price': doc['Hijacker 5 Price'] ?? '',
        'Hijacker 5 MOQ': doc['Hijacker 5 MOQ'] ?? '',
        'Hijacker 6': doc['Hijacker 6'] ?? '',
        'Hijacker 6 Price': doc['Hijacker 6 Price'] ?? '',
        'Hijacker 6 MOQ': doc['Hijacker 6 MOQ'] ?? '',
        'Hijacker 7': doc['Hijacker 7'] ?? '',
        'Hijacker 7 Price': doc['Hijacker 7 Price'] ?? '',
        'Hijacker 7 MOQ': doc['Hijacker 7 MOQ'] ?? '',
        'Hijacker 8': doc['Hijacker 8'] ?? '',
        'Hijacker 8 Price': doc['Hijacker 8 Price'] ?? '',
        'Hijacker 8 MOQ': doc['Hijacker 8 MOQ'] ?? '',
        'Hijacker 9': doc['Hijacker 9'] ?? '',
        'Hijacker 9 Price': doc['Hijacker 9 Price'] ?? '',
        'Hijacker 9 MOQ': doc['Hijacker 9 MOQ'] ?? '',
        'Hijacker 10': doc['Hijacker 10'] ?? '',
        'Hijacker 10 Price': doc['Hijacker 10 Price'] ?? '',
        'Hijacker 10 MOQ': doc['Hijacker 10 MOQ'] ?? '',
        // camelCase aliases for frontend convenience
        hijacker1: doc['Hijacker 1'] ?? '',
        hijacker1Price: doc['Hijacker 1 Price'] ?? '',
        hijacker1MOQ: doc['Hijacker 1 MOQ'] ?? '',
        hijacker2: doc['Hijacker 2'] ?? '',
        hijacker2Price: doc['Hijacker 2 Price'] ?? '',
        hijacker2MOQ: doc['Hijacker 2 MOQ'] ?? '',
        hijacker3: doc['Hijacker 3'] ?? '',
        hijacker3Price: doc['Hijacker 3 Price'] ?? '',
        hijacker3MOQ: doc['Hijacker 3 MOQ'] ?? '',
        hijacker4: doc['Hijacker 4'] ?? '',
        hijacker4Price: doc['Hijacker 4 Price'] ?? '',
        hijacker4MOQ: doc['Hijacker 4 MOQ'] ?? '',
        hijacker5: doc['Hijacker 5'] ?? '',
        hijacker5Price: doc['Hijacker 5 Price'] ?? '',
        hijacker5MOQ: doc['Hijacker 5 MOQ'] ?? '',
        hijacker6: doc['Hijacker 6'] ?? '',
        hijacker6Price: doc['Hijacker 6 Price'] ?? '',
        hijacker6MOQ: doc['Hijacker 6 MOQ'] ?? '',
        hijacker7: doc['Hijacker 7'] ?? '',
        hijacker7Price: doc['Hijacker 7 Price'] ?? '',
        hijacker7MOQ: doc['Hijacker 7 MOQ'] ?? '',
        hijacker8: doc['Hijacker 8'] ?? '',
        hijacker8Price: doc['Hijacker 8 Price'] ?? '',
        hijacker8MOQ: doc['Hijacker 8 MOQ'] ?? '',
        hijacker9: doc['Hijacker 9'] ?? '',
        hijacker9Price: doc['Hijacker 9 Price'] ?? '',
        hijacker9MOQ: doc['Hijacker 9 MOQ'] ?? '',
        hijacker10: doc['Hijacker 10'] ?? '',
        hijacker10Price: doc['Hijacker 10 Price'] ?? '',
        hijacker10MOQ: doc['Hijacker 10 MOQ'] ?? '',
      };
    });

    // Latest data date for Buybox – for "Data updated as of". Use parseDateKey so DD-MMM-YYYY (e.g. "10-Feb-2026") is ordered correctly.
    const latestBuyboxDoc = docs.reduce((latest, cur) => {
      const curKey = parseDateKey(cur.Date);
      if (!curKey) return latest;
      if (!latest) return cur;
      const latestKey = parseDateKey(latest.Date);
      if (!latestKey) return cur;
      return curKey >= latestKey ? cur : latest;
    }, null);
    const updatedAt = latestBuyboxDoc?.Date
      ? (parseDateKey(latestBuyboxDoc.Date)
        ? new Date(parseDateKey(latestBuyboxDoc.Date) + 'T12:00:00.000Z').toISOString()
        : new Date(latestBuyboxDoc.Date).toISOString())
      : new Date().toISOString();

    const dateFilterType = req.query.dateFilterType || '';
    const customRangeStart = req.query.customRangeStart || '';
    const customRangeEnd = req.query.customRangeEnd || '';
    let comparison = null;

    if (dateFilterType) {
      const periods = getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd);
      if (periods) {
        const currentSet = new Set(periods.current);
        const comparisonSet = new Set(periods.comparison);
        const currentRows = rows.filter((r) => r.reportMonth && currentSet.has(r.reportMonth));
        const comparisonRows = rows.filter((r) => r.reportMonth && comparisonSet.has(r.reportMonth));
        const curr = aggregateBuyboxRows(currentRows);
        const prev = aggregateBuyboxRows(comparisonRows);

        const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

        comparison = {
          overallBuyboxPct: { pctChange: fmt(pctChange(curr.overallBuyboxPct, prev.overallBuyboxPct)) },
          noBuyboxSkus: { pctChange: fmt(pctChange(curr.noBuyboxSkus, prev.noBuyboxSkus)) },
          amazonAeCount: { pctChange: fmt(pctChange(curr.amazonAeCount, prev.amazonAeCount)) },
        };
      }
    }

    const normalizeRowDate = (r) => (r.reportDate && r.reportDate.length >= 10 ? r.reportDate.slice(0, 10) : parseDateKey(r.reportDate));

    let rowsToReturn = rows;
    let summaryFromApi = null;
    let updatedAtForResponse = updatedAt;

    if (customRangeStart) {
      const selectedKey = parseDateKey(customRangeStart);
      const endKey = parseDateKey(customRangeEnd) || selectedKey;
      if (selectedKey) {
        rowsToReturn = rows.filter((r) => {
          const rd = normalizeRowDate(r);
          return rd >= selectedKey && rd <= endKey;
        });
        summaryFromApi = aggregateBuyboxRows(rowsToReturn);
        updatedAtForResponse = selectedKey ? `${selectedKey}T12:00:00.000Z` : updatedAt;
        const selectedDate = new Date(selectedKey);
        if (!Number.isNaN(selectedDate.getTime())) {
          const prevDate = new Date(selectedDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevKey = parseDateKey(prevDate);
          const currentRows = rows.filter((r) => normalizeRowDate(r) === selectedKey);
          const comparisonRows = rows.filter((r) => normalizeRowDate(r) === prevKey);
          const curr = aggregateBuyboxRows(currentRows);
          const prev = aggregateBuyboxRows(comparisonRows);
          const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
          comparison = {
            overallBuyboxPct: { pctChange: fmt(pctChange(curr.overallBuyboxPct, prev.overallBuyboxPct)) },
            noBuyboxSkus: { pctChange: fmt(pctChange(curr.noBuyboxSkus, prev.noBuyboxSkus)) },
            amazonAeCount: { pctChange: fmt(pctChange(curr.amazonAeCount, prev.amazonAeCount)) },
          };
        }
      }
    }

    const payload = {
      title: 'Buybox',
      rows: rowsToReturn,
      total: rowsToReturn.length,
      salesChannelOptions,
      updatedAt: updatedAtForResponse,
      ...(summaryFromApi && { summary: summaryFromApi }),
      ...(comparison && { comparison }),
    };

    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching buybox data:', error);
    res.status(500).json({ message: 'Failed to fetch buybox data' });
  }
});

router.get('/buybox-last30-sales', async (req, res) => {
  try {
    const cacheKey = buildDashboardCacheKey(req, 'buybox-last30-sales');
    const ttlSeconds = 600; // 10 minutes
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached);
    }

    const reqCustomRangeEnd = req.query.customRangeEnd || '';
    const reqCustomRangeStart = req.query.customRangeStart || '';
    const reqSalesChannel = req.query.salesChannel ? String(req.query.salesChannel).trim().toLowerCase() : '';

    let docsFilter = {};
    if (reqCustomRangeStart) {
      const selectedKey = parseDateKey(reqCustomRangeStart);
      const endKey = parseDateKey(reqCustomRangeEnd) || selectedKey;

      if (selectedKey) {
        if (selectedKey === endKey) {
          docsFilter = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], selectedKey);
        } else {
          const startDate = new Date(selectedKey);
          const endDate = new Date(endKey);
          if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
            const days = dateList(startDate, endDate);
            const clauses = [];
            days.forEach((dayKey) => {
              const q = dateMatchQueryAny(['Date', 'date', 'DATE', 'Date '], dayKey);
              if (q?.$or?.length) clauses.push(...q.$or);
            });
            if (clauses.length) docsFilter = { $or: clauses };
          }
        }
      }
    }

    // Sales live in the `revenues` collection, so compute Last 30 Days Sales from Revenue.
    const docs = await req.companyModels.Revenue.find(docsFilter).lean();

    const byAsin = new Map();
    docs.forEach((doc) => {
      if (reqSalesChannel) {
        const ch = revenueChannelFromDoc(doc);
        const norm = ch == null ? '' : String(ch).trim().toLowerCase();
        if (!norm) return;
        const matches = norm === reqSalesChannel || norm.includes(reqSalesChannel) || reqSalesChannel.includes(norm);
        if (!matches) return;
      }
      const asin = revenueAsinFromDoc(doc);
      if (!asin) return;
      const sales = parseNum(doc.total_sales);
      if (!sales) return;
      byAsin.set(asin, (byAsin.get(asin) || 0) + sales);
    });

    const payload = { last30SalesByAsin: Object.fromEntries(byAsin.entries()) };
    await Cache.set(cacheKey, payload, ttlSeconds);
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching buybox last30 sales:', error);
    res.status(500).json({ message: 'Failed to fetch buybox last30 sales' });
  }
});
router.get('/product-details', (req, res) => res.json(productDetails));

// Single endpoint that returns some static sections (optional)
router.get('/', (req, res) => {
  res.json({
    executiveSummary,
    productDetails,
  });
});

export default router;
