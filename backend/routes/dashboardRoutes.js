import express from 'express';
import mongoose from 'mongoose';
import { getCompanyModels } from '../models/companyDb.js';

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

/**
 * Get list of YYYY-MM months for current and comparison period.
 * - Current month → compare to previous month
 * - Previous month → compare to month before that
 * - Custom single month (e.g. Feb) → compare to Jan
 * - Custom range → compare to same-length period immediately before
 * - Current year → compare to previous year
 * - Previous year → compare to year before that
 */
function getPeriodMonths(dateFilterType, customStart, customEnd) {
  // Data arrives with a T-3 lag; treat "current" as today-3 days.
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 3);
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
      { [fieldName]: { $regex: `^${dateKey}` } },
      { [fieldName]: { $regex: `^${ddMonYYYY}` } },
      { [fieldName]: { $regex: `^${ddMonYY}` } },
      { [fieldName]: { $gte: start, $lte: end } },
    ],
  };
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

    const filter = {};
    if (salesChannel) {
      filter.$or = [
        { 'Sales Channel': salesChannel },
        { salesChannel },
        { channel: salesChannel },
      ];
    }

    const docs = await Model.find(filter, { Date: 1 }).lean();
    let best = '';
    docs.forEach((d) => {
      const key = parseDateKey(d?.Date);
      if (key && (!best || key > best)) best = key;
    });

    const updatedAt = best ? `${best}T12:00:00.000Z` : new Date().toISOString();

    return res.json({
      dataset: datasetRaw,
      salesChannel: salesChannel || '',
      dateKey: best || '',
      updatedAt,
    });
  } catch (error) {
    console.error('Error fetching latest updated date:', error);
    return res.status(500).json({ message: 'Failed to fetch latest updated date' });
  }
});

router.get('/executive-summary', async (req, res) => {
  try {
    const salesChannel = String(req.query.salesChannel || '').trim();
    const buyboxChannelMatch = salesChannel
      ? {
          $or: [
            { 'Sales Channel': salesChannel },
            { salesChannel },
            { channel: salesChannel },
          ],
        }
      : {};

    // Use the latest snapshot date across revenue + buybox datasets.
    // IMPORTANT: Do NOT rely on `sort({ Date: -1 })` because Date is often a string
    // like "13-Mar-2026", which doesn't sort chronologically.
    const [revenueDateKey, buyboxDateKey] = await Promise.all([
      (async () => {
        const docs = await req.companyModels.Revenue.find({}, { Date: 1 }).lean();
        let best = '';
        docs.forEach((d) => {
          const key = parseDateKey(d?.Date);
          if (key && (!best || key > best)) best = key;
        });
        return best;
      })(),
      (async () => {
        const docs = await req.companyModels.Buybox.find(buyboxChannelMatch, { Date: 1 }).lean();
        let best = '';
        docs.forEach((d) => {
          const key = parseDateKey(d?.Date);
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
      $ifNull: ['$Product Name', { $ifNull: ['$Product Name ', { $ifNull: ['$productName', '$__missing_product__'] }] }],
    };
    const salesChannelExpr = {
      $ifNull: [
        '$Sales Channel',
        {
          $ifNull: [
            '$Sales Channel ',
            { $ifNull: ['$salesChannel', { $ifNull: ['$channel', '$__missing_channel__'] }] },
          ],
        },
      ],
    };
    const currentOwnerExpr = {
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
    };
    // Match Buybox page logic: use the latest snapshot date (optionally per Sales Channel),
    // then compute "no buybox" as any Current Owner that is NOT Amazon.ae on that same date.
    const buyboxDateKeyEffective = buyboxDateKey || dataUpdated;

    // ASIN lists for the latest snapshot in buyboxes.
    const openPODetailsPromise = (async () => {
      // From pattex.buyboxes, column "Open POs" > 0 on latest date.
      const match = {
        ...buyboxChannelMatch,
        ...dateMatchQuery('Date', buyboxDateKeyEffective),
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
        ...dateMatchQuery('Date', buyboxDateKeyEffective),
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
        ...dateMatchQuery('Date', buyboxDateKeyEffective),
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

    return res.json({
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
    });
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
      targetFilter.$and.push({
        $or: [
          { 'Sales Channel': salesChannel },
          { salesChannel },
          { channel: salesChannel },
        ],
      });
    }

    const targetDocs = await req.companyModels.Target.find(targetFilter).lean();
    const targetOverallRevenue = targetDocs.reduce((s, d) => s + parseNum(d?.['Overall Sales'] ?? d?.overallSales ?? d?.overall_sales), 0);
    const targetOverallSpend = targetDocs.reduce((s, d) => s + parseNum(d?.['Ad Spend'] ?? d?.adSpend ?? d?.ad_spend), 0);

    // Actual MTD (current month) from revenues
    const revDocs = await req.companyModels.Revenue.find({}).lean();
    const actualRows = revDocs.filter((d) => {
      const dateKey = parseDateKey(d?.Date);
      if (!dateKey) return false;
      if (dateKey.slice(0, 7) !== ym) return false;
      if (!salesChannel) return true;
      const ch = String(d?.['Sales Channel'] ?? d?.salesChannel ?? d?.channel ?? '').trim();
      return ch === salesChannel;
    });
    const actualOverallRevenue = actualRows.reduce((s, d) => s + parseNum(d?.total_sales ?? d?.totalSales ?? d?.['Overall Sales']), 0);
    const actualOverallSpend = actualRows.reduce((s, d) => s + parseNum(d?.ads_spend ?? d?.adSpend ?? d?.['Ad Spend']), 0);

    const variationPct = (actual, target) => {
      const t = Number(target) || 0;
      const a = Number(actual) || 0;
      if (t === 0) return null;
      return ((a - t) / t) * 100;
    };

    return res.json({
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
    });
  } catch (error) {
    console.error('Error fetching key performance metrics:', error);
    return res.status(500).json({ message: 'Failed to fetch key performance metrics' });
  }
});
router.get('/revenue', async (req, res) => {
  try {
    const salesChannelFilter = String(req.query.salesChannel || '').trim();
    const docFilter = {};
    if (salesChannelFilter) {
      docFilter.$or = [
        { 'Sales Channel': salesChannelFilter },
        { salesChannel: salesChannelFilter },
        { channel: salesChannelFilter },
      ];
    }

    const docs = await req.companyModels.Revenue.find(docFilter).lean();
    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const adUnits = parseNum(doc.ads_unit_sold);
      const adRevenue = parseNum(doc.ads_sales);
      const organicRevenue = parseNum(doc.organic_sale);
      const organicUnits = Math.max(0, totalUnits - adUnits);
      const aov = totalUnits > 0 ? totalSales / totalUnits : 0;
      const adsSpend = parseNum(doc.ads_spend);
      const tacos = totalSales > 0 ? (adsSpend / totalSales) * 100 : 0;
      const snapshotDateKey = parseDateKey(doc.Date);
      const reportDate = snapshotDateKey || '';
      const reportMonth = snapshotDateKey ? snapshotDateKey.slice(0, 7) : '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN ?? '',
        productName: doc['Product Name'] ?? '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
        salesChannel: doc['Sales Channel'] ?? doc.salesChannel ?? doc.channel ?? '',
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
    });

    // Latest data date for Revenue – used by frontend to show
    // "Data updated as of" based on the most recent document.
    const latestRevenueDoc = docs.reduce((latest, cur) => {
      const curDate = cur.Date ? new Date(cur.Date) : null;
      if (!curDate || Number.isNaN(curDate.getTime())) return latest;
      if (!latest) return cur;
      const latestDate = latest.Date ? new Date(latest.Date) : null;
      if (!latestDate || Number.isNaN(latestDate.getTime())) return cur;
      return curDate > latestDate ? cur : latest;
    }, null);
    const updatedAt = latestRevenueDoc?.Date
      ? new Date(latestRevenueDoc.Date).toISOString()
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

    res.json({
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
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({ message: 'Failed to fetch revenue data' });
  }
});

// Marketing dashboard – pulls data from the `marketings` collection and
// returns KPI cards + combo chart data (line vs bar) similar to Amazon.
router.get('/marketing', async (req, res) => {
  try {
    const docs = await req.companyModels.Marketing.find({}).lean();

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

    // Unique Sales Channel values from entire collection (for dropdowns, not limited by filters)
    const salesChannelSet = new Set();
    docs.forEach((doc) => {
      const val = doc['Sales Channel'];
      if (val != null && String(val).trim() !== '') salesChannelSet.add(String(val).trim());
    });
    const salesChannelOptions = Array.from(salesChannelSet).sort((a, b) => String(a).localeCompare(String(b)));

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

    const periods = dateFilterType ? getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd) : null;
    const currentSet = periods ? new Set(periods.current) : null;
    const comparisonSet = periods ? new Set(periods.comparison) : null;

    const reportMonthForDoc = (doc) => {
      const ymd = parseDateKey(doc.Date);
      return ymd ? ymd.slice(0, 7) : '';
    };

    const applyMarketingFilters = (doc) => {
      if (asinFilter && String(doc.ASIN ?? '') !== String(asinFilter)) return false;
      if (productNameFilter && String(doc['Product Name'] ?? '') !== String(productNameFilter)) return false;
      if (
        productCategoryFilter
        && String(doc['Product Category'] ?? doc['Product Sub Category'] ?? '') !== String(productCategoryFilter)
      ) return false;
      if (packSizeFilter && String(doc['Pack Size'] != null ? String(doc['Pack Size']) : '') !== String(packSizeFilter)) return false;
      if (salesChannelFilter && String(doc['Sales Channel'] ?? '') !== String(salesChannelFilter)) return false;
      return true;
    };

    const docsFiltered = docs.filter(applyMarketingFilters);

    const docsForCurrent = currentSet ? docsFiltered.filter((d) => currentSet.has(reportMonthForDoc(d))) : docsFiltered;
    const docsForComparison = comparisonSet ? docsFiltered.filter((d) => comparisonSet.has(reportMonthForDoc(d))) : [];

    // Campaign-level filters (independent of top date filter if a separate range is chosen)
    const applyCampaignFilters = (doc) => {
      if (campaignTypeFilter && String(doc['Campaign Type'] ?? '') !== String(campaignTypeFilter)) return false;
      if (campaignNameFilter && String(doc['Campaign Name'] ?? '') !== String(campaignNameFilter)) return false;
      if (campaignPortfolioFilter && String(doc['Portfolio name'] ?? '') !== String(campaignPortfolioFilter)) return false;
      if (campaignSalesChannelFilter && String(doc['Sales Channel'] ?? '') !== String(campaignSalesChannelFilter)) return false;
      return true;
    };

    const docsForCampaignBase = docsFiltered.filter(applyCampaignFilters);

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
      const asin = doc.ASIN ?? '';
      const key = String(asin || '').trim() || 'UNKNOWN';
      if (!byAsin.has(key)) {
        byAsin.set(key, {
          asin: key,
          productName: doc['Product Name'] ?? '',
          productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
          packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
          salesChannel: doc['Sales Channel'] ?? '',
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
      const dateKey = parseDateKey(doc.Date);
      if (dateKey && (!agg.latestDateKey || dateKey > agg.latestDateKey)) {
        agg.latestDateKey = dateKey;
        agg.availableInventoryLatest = parseNum(doc['Available Inventory']);
        agg.dosLatest = parseNum(doc.DOS);
      }
      agg.impressions += parseNum(doc.Impressions);
      agg.clicks += parseNum(doc.Clicks);
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
      const name = doc['Campaign Name'] ?? 'UNKNOWN';
      const type = doc['Campaign Type'] ?? '';
      const portfolio = doc['Portfolio name'] ?? '';
      const salesChannel = doc['Sales Channel'] ?? '';
      const key = String(name || '').trim() || `UNKNOWN_${type}`;
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
      agg.impressions += parseNum(doc.Impressions);
      agg.clicks += parseNum(doc.Clicks);
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
        id: `${r.campaignName}-${idx}`,
        campaignType: r.campaignType,
        campaignName: r.campaignName,
        portfolio: r.portfolio,
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
      const dateKey = parseDateKey(doc.Date) || 'UNKNOWN';

      const impressions = parseNum(doc.Impressions);
      const clicks = parseNum(doc.Clicks);
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
      const dateKey = parseDateKey(doc.Date) || 'UNKNOWN';

      const impressions = parseNum(doc.Impressions);
      const clicks = parseNum(doc.Clicks);
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

    res.json({
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
    });
  } catch (error) {
    console.error('Error fetching marketing data:', error);
    res.status(500).json({ message: 'Failed to fetch marketing data' });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const docs = await req.companyModels.Inventory.find({}).lean();

    const rows = docs.map((doc, index) => {
      const availableInventory = Number(doc['Available Inventory'] ?? 0);
      const last30DaysSales = Number(doc.total_sales ?? 0);
      const dos = Number(doc.DOS ?? 0);
      const instockRate = Number(doc['Instock Rate'] ?? 0);
      const openPos = Number(doc['Open POs'] ?? 0);
      const noLowStockWithOpenPos = Number(doc['No/Low Stock wt Open POs'] ?? 0);
      const noLowStockNoOpenPos = Number(doc['No/Low Stock wt no Open POs'] ?? 0);
      const stockStatus = doc.Stock_Status || '';
      const salesChannel = doc['Sales Channel'] || doc.channel || '';
      const reportDate = parseDateKey(doc.Date);
      const reportMonth = reportDate ? reportDate.slice(0, 7) : '';
      const oosDateValue = doc['OOS Date'] ?? doc.OOS_Date ?? doc.Date ?? '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN || '',
        productName: doc['Product Name'] || '',
        category: doc['Product Category'] || doc['Product Sub Category'] || 'UNKNOWN',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : (doc.Pack_Size != null ? String(doc.Pack_Size) : ''),
        channel: salesChannel,
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
      const curKey = parseDateKey(cur.Date);
      if (!curKey) return latest;
      if (!latest) return cur;
      const latestKey = parseDateKey(latest.Date);
      if (!latestKey) return cur;
      return curKey >= latestKey ? cur : latest;
    }, null);
    const updatedAt = latestInventoryDoc?.Date
      ? (parseDateKey(latestInventoryDoc.Date)
          ? new Date(parseDateKey(latestInventoryDoc.Date) + 'T12:00:00.000Z').toISOString()
          : new Date(latestInventoryDoc.Date).toISOString())
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

    res.json({
      title: 'Inventory',
      rows,
      total: rows.length,
      updatedAt,
      ...(comparison && { comparison }),
    });
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    res.status(500).json({ message: 'Failed to fetch inventory data' });
  }
});

router.get('/buybox', async (req, res) => {
  try {
    const docs = await req.companyModels.Buybox.find({}).lean();

    // Unique Sales Channel values from entire collection (for dropdown, not limited by date filter)
    const salesChannelSet = new Set();
    docs.forEach((doc) => {
      const val = doc['Sales Channel'];
      if (val != null && String(val).trim() !== '') salesChannelSet.add(String(val).trim());
    });
    const salesChannelOptions = Array.from(salesChannelSet).sort((a, b) => String(a).localeCompare(String(b)));

    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const instockRate = parseNum(doc['Instock Rate']);
      const availableInventory = parseNum(doc['Available Inventory']);
      const dos = parseNum(doc.DOS);
      const openPos = parseNum(doc['Open POs']);
      const reportDate = parseDateKey(doc.Date);
      const reportMonth = reportDate ? reportDate.slice(0, 7) : '';
      const buyboxOwner =
        doc['Current Owner'] ?? doc['Current Owner '] ?? doc.CurrentOwner ?? doc.currentOwner ?? doc.BuyBox ?? '';
      const hasBuybox =
        typeof buyboxOwner === 'string'
          ? buyboxOwner.trim().toLowerCase() !== 'no' && buyboxOwner.trim() !== ''
          : Boolean(buyboxOwner);

      return {
        // identifiers
        _id: doc._id?.toString() || String(index + 1),
        id: doc._id?.toString() || String(index + 1),
        // core product fields
        asin: doc.ASIN ?? '',
        productName: doc['Product Name'] ?? '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
        brand: doc.Brand ?? '',
        productSubCategory: doc['Product Sub Category'] ?? '',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
        salesChannel: doc['Sales Channel'] ?? '',
        packType: doc['Pack Type'] ?? '',
        reportMonth,
        reportDate,
        // inventory & sales metrics
        availableInventory,
        last30DaysSales: totalSales,
        dos,
        instockRate,
        openPos,
        oosDate: doc['OOS Date'] ?? doc.OOS_Date ?? doc.OOS_Date_2 ?? doc.OOS_Date_3 ?? doc.OOS_Date_4 ?? doc.OOS_Date_5 ?? '',
        stockStatus: doc.Stock_Status || '',
        totalUnits,
        totalSales,
        sellThrough: parseNum(doc.sell_through),
        aged90Amount: parseNum(doc['Aged 90+ Days Sellable Inventory']),
        aged90Units: parseNum(doc['Aged 90+ Days Sellable Units']),
        sellableInventoryAmount: parseNum(doc['Sellable Inventory Amount']),
        unsellableOnHandAmount: parseNum(doc['Unsellable On Hand Inventory Amount']),
        unsellableOnHandUnits: parseNum(doc['Unsellable On Hand Units']),
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
        Brand: doc.Brand ?? '',
        'Product Sub Category': doc['Product Sub Category'] ?? '',
        'Vendor Confirmation %': doc['Vendor Confirmation %'] ?? '',
        PO_received_amount: doc.PO_received_amount ?? doc.PO_received_amt ?? '',
        PO_received_Units: doc.PO_received_Units ?? '',
        'Open POs': doc['Open POs'] ?? '',
        Receive_Fill_Rate: doc.Receive_Fill_Rate ?? '',
        'Overall Vendor Lead Time (days)': doc['Overall Vendor Lead Time (days)'] ?? '',
        'Aged 90+ Days Sellable Inventory': doc['Aged 90+ Days Sellable Inventory'] ?? '',
        'Aged 90+ Days Sellable Units': doc['Aged 90+ Days Sellable Units'] ?? '',
        'Sellable Inventory Amount': doc['Sellable Inventory Amount'] ?? '',
        'Available Inventory': doc['Available Inventory'] ?? '',
        'Unsellable On Hand Inventory Amount': doc['Unsellable On Hand Inventory Amount'] ?? '',
        'Unsellable On Hand Units': doc['Unsellable On Hand Units'] ?? '',
        Date: doc.Date ?? '',
        'Sales Channel': doc['Sales Channel'] ?? '',
        in_stock_flag: doc.in_stock_flag ?? '',
        cumulative_instock_days: doc.cumulative_instock_days ?? '',
        day_of_month: doc.day_of_month ?? '',
        'Instock Rate': doc['Instock Rate'] ?? '',
        'OOS Date': doc['OOS Date'] ?? doc.OOS_Date ?? '',
        total_sales: doc.total_sales ?? '',
        total_units: doc.total_units ?? '',
        sell_through: doc.sell_through ?? '',
        DOS: doc.DOS ?? '',
        min_available_qty: doc.min_available_qty ?? '',
        max_available_qty: doc.max_available_qty ?? '',
        Stock_Status: doc.Stock_Status ?? '',
        'No/Low Stock wt Open POs': doc['No/Low Stock wt Open POs'] ?? '',
        'No/Low Stock wt no Open POs': doc['No/Low Stock wt no Open POs'] ?? '',
        'Product Name': doc['Product Name'] ?? '',
        'Pack Type': doc['Pack Type'] ?? '',
        'SC Ideal Price': doc['SC Ideal Price'] ?? '',
        'VC Ideal Price': doc['VC Ideal Price'] ?? '',
        'Product Category': doc['Product Category'] ?? '',
        'Current Owner': buyboxOwner,
        'Current Owner Price': doc['Current Owner Price'] ?? '',
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

    res.json({
      title: 'Buybox',
      rows: rowsToReturn,
      total: rowsToReturn.length,
      salesChannelOptions,
      updatedAt: updatedAtForResponse,
      ...(summaryFromApi && { summary: summaryFromApi }),
      ...(comparison && { comparison }),
    });
  } catch (error) {
    console.error('Error fetching buybox data:', error);
    res.status(500).json({ message: 'Failed to fetch buybox data' });
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
