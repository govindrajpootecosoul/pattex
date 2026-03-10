import express from 'express';
import Inventory from '../models/Inventory.js';
import Revenue from '../models/Revenue.js';
import Marketing from '../models/Marketing.js';
import Buybox from '../models/Buybox.js';

const router = express.Router();

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
  const now = new Date();
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

function aggregateBuyboxRows(rows) {
  const total = rows.length;
  if (!total) return { overallBuyboxPct: 0, noBuyboxSkus: 0 };
  const withBuybox = rows.reduce((s, r) => s + (r.hasBuybox ? 1 : 0), 0);
  const noBuyboxSkus = total - withBuybox;
  const overallBuyboxPct = Math.round((withBuybox / total) * 100);
  return { overallBuyboxPct, noBuyboxSkus };
}

// Static data for dashboard sections (as per requirements)
const executiveSummary = {
  title: 'Executive Summary',
  dataUpdated: new Date().toISOString().split('T')[0],
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
router.get('/executive-summary', (req, res) => res.json(executiveSummary));
router.get('/revenue', async (req, res) => {
  try {
    const docs = await Revenue.find({}).lean();
    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const adUnits = parseNum(doc.ads_unit_sold);
      const adRevenue = parseNum(doc.ads_sales);
      const organicRevenue = parseNum(doc.organic_sale);
      const organicUnits = Math.max(0, totalUnits - adUnits);
      const aov = totalUnits > 0 ? totalSales / totalUnits : 0;
      const tacos = totalSales > 0 ? (parseNum(doc.ads_spend) / totalSales) * 100 : 0;
      const dateStr = doc.Date != null ? String(doc.Date) : '';
      const reportMonth = dateStr ? dateStr.slice(0, 7) : '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN ?? '',
        productName: doc['Product Name'] ?? '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
        salesChannel: doc['Sales Channel'] ?? '',
        reportMonth,
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
      };
    });

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
    const docs = await Marketing.find({}).lean();

    if (!docs || docs.length === 0) {
      return res.json({
        title: 'Marketing',
        metrics: {},
        chartData: [],
        funnelMetrics: [],
        skuRows: [],
        campaignMetrics: {},
      });
    }

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
      const dateRaw = doc.Date != null ? String(doc.Date) : '';
      return dateRaw ? dateRaw.slice(0, 7) : '';
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
      const dateRaw = doc.Date != null ? String(doc.Date) : '';
      const dateKey = dateRaw ? dateRaw.slice(0, 10) : '';
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
      const dateRaw = doc.Date != null ? String(doc.Date) : '';
      const dateKey = dateRaw ? dateRaw.slice(0, 10) : 'UNKNOWN';

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
            ? new Date(entry.dateKey).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
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
      const dateRaw = doc.Date != null ? String(doc.Date) : '';
      const dateKey = dateRaw ? dateRaw.slice(0, 10) : 'UNKNOWN';

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
            ? new Date(entry.dateKey).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
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
    const docs = await Inventory.find({}).lean();

    const rows = docs.map((doc, index) => {
      const availableInventory = Number(doc['Available Inventory'] ?? 0);
      const last30DaysSales = Number(doc.total_sales ?? 0);
      const dos = Number(doc.DOS ?? 0);
      const instockRate = Number(doc['Instock Rate'] ?? 0);
      const openPos = Number(doc['Open POs'] ?? 0);
      const noLowStockWithOpenPos = Number(doc['No/Low Stock wt Open POs'] ?? 0);
      const noLowStockNoOpenPos = Number(doc['No/Low Stock wt no Open POs'] ?? 0);
      const stockStatus = doc.Stock_Status || '';
      const salesChannel = doc['Sales Channel'] || '';
      const date = doc.Date || '';

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN || '',
        productName: doc['Product Name'] || '',
        category: doc['Product Category'] || doc['Product Sub Category'] || 'UNKNOWN',
        packSize: doc.Pack_Size || '',
        channel: salesChannel,
        available: availableInventory,
        last30DaysSales,
        dos,
        instockRate,
        openPos,
        oosDate: date,
        status: stockStatus,
        noLowStockWithOpenPos,
        noLowStockNoOpenPos,
        isLowStock:
          stockStatus === 'Low Stock' ||
          stockStatus === 'Critical' ||
          stockStatus.toLowerCase().includes('low stock'),
        hasOpenPo: openPos > 0,
        reportMonth: date ? String(date).slice(0, 7) : '',
      };
    });

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
    }

    res.json({
      title: 'Inventory',
      rows,
      total: rows.length,
      ...(comparison && { comparison }),
    });
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    res.status(500).json({ message: 'Failed to fetch inventory data' });
  }
});

router.get('/buybox', async (req, res) => {
  try {
    const docs = await Buybox.find({}).lean();

    const rows = docs.map((doc, index) => {
      const totalUnits = parseNum(doc.total_units);
      const totalSales = parseNum(doc.total_sales);
      const instockRate = parseNum(doc['Instock Rate']);
      const availableInventory = parseNum(doc['Available Inventory']);
      const dos = parseNum(doc.DOS);
      const openPos = parseNum(doc['Open POs']);
      const dateStr = doc.Date != null ? String(doc.Date) : '';
      const reportMonth = dateStr ? dateStr.slice(0, 7) : '';

      const buyboxOwner = doc.BuyBox || '';
      const hasBuybox =
        typeof buyboxOwner === 'string'
          ? buyboxOwner.trim().toLowerCase() !== 'no' && buyboxOwner.trim() !== ''
          : Boolean(buyboxOwner);

      return {
        id: doc._id?.toString() || String(index + 1),
        asin: doc.ASIN ?? '',
        productName: doc['Product Name'] ?? '',
        productCategory: doc['Product Category'] ?? doc['Product Sub Category'] ?? '',
        brand: doc.Brand ?? '',
        packSize: doc['Pack Size'] != null ? String(doc['Pack Size']) : '',
        salesChannel: doc['Sales Channel'] ?? '',
        reportMonth,
        availableInventory,
        last30DaysSales: totalSales,
        dos,
        instockRate,
        openPos,
        oosDate: doc.OOS_Date || doc.OOS_Date_2 || doc.OOS_Date_3 || doc.OOS_Date_4 || doc.OOS_Date_5 || '',
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
        hasBuybox,
        currentBuyboxOwner: buyboxOwner,
        currentBuyboxPrice: doc.Price ?? null,
        currentVcPrice: doc['VC Ideal Price'] ?? null,
        currentScPrice: doc['SC Ideal Price'] ?? null,
      };
    });

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
        };
      }
    }

    res.json({
      title: 'Buybox',
      rows,
      total: rows.length,
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
