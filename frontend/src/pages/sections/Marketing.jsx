import { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Bar } from 'recharts';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';
import { formatDateDDMonYY } from '../../utils/dateFormat';
import { useSalesChannels } from '../../hooks/useSalesChannels';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
  { id: 'CUSTOM_RANGE', label: 'Custom Range' },
];

const OTHER_COLUMNS = [
  'Date',
  'Available Inventory',
  'Last 30 Days Sales',
  'DOS',
  'Impressions',
  'Clicks',
  'CTR',
  'CPC',
  'CVR',
  'Ad Spend',
  'Ad Unit Sold',
  'Ad Sales',
  'ACoS',
  'Overall Unit Sold',
  'Overall Revenue',
  'TACOS',
  'Organic Unit Sold',
  'Organic Revenue',
  'NTB Unit Sold',
  'NTB Revenue',
];

const FUNNEL_METRICS = ['Impressions', 'Clicks', 'Sales'];

const SKU_GROUP_FILTERS = [
  { id: 'BEST_REVENUE', label: 'Top 10 Best Performers - Revenue' },
  { id: 'WORST_REVENUE', label: 'Top 10 Worst Performers - Revenue' },
];

const getDateRangeForFilter = (dateFilterType) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (!dateFilterType) return null;
  if (dateFilterType === 'CURRENT_MONTH') {
    const mm = String(m + 1).padStart(2, '0');
    const ym = `${y}-${mm}`;
    return { start: ym, end: ym };
  }
  if (dateFilterType === 'PREVIOUS_MONTH') {
    const prev = new Date(y, m - 1, 1);
    const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    return { start: ym, end: ym };
  }
  if (dateFilterType === 'CURRENT_YEAR') {
    return { start: `${y}-01`, end: `${y}-12` };
  }
  if (dateFilterType === 'PREVIOUS_YEAR') {
    return { start: `${y - 1}-01`, end: `${y - 1}-12` };
  }
  return null;
};
// (SKU-level date/channel filters removed from UI)

// Fallback chart data used only when the backend has no marketing data yet.
const MARKETING_CHART_DATA = [
  {
    month: 'Jan 01',
    totalCost: 800,
    adSpend: 800,
    overallRevenue: 2400,
    impressions: 80000,
    clicks: 1600,
    purchases: 400,
    adSales: 1200,
    adUnitSold: 200,
    overallUnitSold: 400,
    ctr: (1600 / 80000) * 100,
    cpc: 800 / 1600,
    cvr: (400 / 1600) * 100,
    acos: (800 / 2400) * 100,
    tacos: (800 / 2400) * 100,
    organicUnitSold: 200,
    organicRevenue: 1200,
    ntbUnitSold: 0,
    ntbRevenue: 0,
    roas: 2400 / 800,
  },
  {
    month: 'Jan 02',
    totalCost: 1600,
    adSpend: 1600,
    overallRevenue: 4800,
    impressions: 180000,
    clicks: 3200,
    purchases: 600,
    adSales: 2400,
    adUnitSold: 300,
    overallUnitSold: 600,
    ctr: (3200 / 180000) * 100,
    cpc: 1600 / 3200,
    cvr: (600 / 3200) * 100,
    acos: (1600 / 4800) * 100,
    tacos: (1600 / 4800) * 100,
    organicUnitSold: 300,
    organicRevenue: 2400,
    ntbUnitSold: 0,
    ntbRevenue: 0,
    roas: 4800 / 1600,
  },
  {
    month: 'Jan 03',
    totalCost: 450,
    adSpend: 450,
    overallRevenue: 1350,
    impressions: 38000,
    clicks: 900,
    purchases: 220,
    adSales: 650,
    adUnitSold: 120,
    overallUnitSold: 220,
    ctr: (900 / 38000) * 100,
    cpc: 450 / 900,
    cvr: (220 / 900) * 100,
    acos: (450 / 1350) * 100,
    tacos: (450 / 1350) * 100,
    organicUnitSold: 100,
    organicRevenue: 700,
    ntbUnitSold: 0,
    ntbRevenue: 0,
    roas: 1350 / 450,
  },
];

const PERFORMANCE_METRIC_OPTIONS = [
  { id: 'impressions', label: 'Impressions', color: '#008296', format: 'integer', axis: 'right' },
  { id: 'clicks', label: 'Clicks', color: '#60a5fa', format: 'integer', axis: 'right' },
  { id: 'ctr', label: 'CTR', color: '#f97316', format: 'percent', axis: 'right' },
  { id: 'cpc', label: 'CPC', color: '#d0137a', format: 'currency', axis: 'left' },
  { id: 'cvr', label: 'CVR', color: '#22c55e', format: 'percent', axis: 'right' },
  { id: 'adSpend', label: 'Ad Spend', color: '#7d38cc', format: 'currency', axis: 'left' },
  { id: 'adUnitSold', label: 'Ad Unit Sold', color: '#0ea5e9', format: 'integer', axis: 'right' },
  { id: 'adSales', label: 'Ad Sales', color: '#6366f1', format: 'currency', axis: 'left' },
  { id: 'acos', label: 'ACoS', color: '#4285f4', format: 'percent', axis: 'right' },
  { id: 'overallUnitSold', label: 'Overall Unit Sold', color: '#10b981', format: 'integer', axis: 'right' },
  { id: 'overallRevenue', label: 'Overall Revenue', color: '#14b8a6', format: 'currency', axis: 'left' },
  { id: 'tacos', label: 'TACOS', color: '#facc15', format: 'percent', axis: 'right' },
  { id: 'organicUnitSold', label: 'Organic Unit Sold', color: '#4ade80', format: 'integer', axis: 'right' },
  { id: 'organicRevenue', label: 'Organic Revenue', color: '#2dd4bf', format: 'currency', axis: 'left' },
];

function MarketingPerformanceTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload;

  return (
    <div
      style={{
        background: '#ffffff',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.15)',
        borderRadius: 12,
        padding: '10px 14px',
        border: '1px solid rgba(148, 163, 184, 0.4)',
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#7d38cc' }} />
            Total cost
          </span>
          <span style={{ fontWeight: 600 }}>
            {point.totalCost != null
              ? `AED ${Number(point.totalCost).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} />
            Purchases
          </span>
          <span style={{ fontWeight: 600 }}>
            {point.purchases != null ? point.purchases.toLocaleString() : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#d0137a' }} />
            Clicks
          </span>
          <span style={{ fontWeight: 600 }}>
            {point.clicks != null ? point.clicks.toLocaleString() : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#008296' }} />
            Impressions
          </span>
          <span style={{ fontWeight: 600 }}>
            {point.impressions != null ? point.impressions.toLocaleString() : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

const SKU_TABLE_COLUMNS = [
  { id: 'asin', label: 'ASIN' },
  { id: 'productName', label: 'Product Name' },
  { id: 'productCategory', label: 'Product Category' },
  { id: 'packSize', label: 'Pack Size' },
  { id: 'salesChannel', label: 'Sales Channel' },
  { id: 'availableInventory', label: 'Available Inventory' },
  { id: 'last30Sales', label: 'Last 30 Days Sales' },
  { id: 'dos', label: 'DOS' },
  { id: 'impressions', label: 'Impressions' },
  { id: 'clicks', label: 'Clicks' },
];

const CAMPAIGN_DETAIL_OTHER_COLUMNS = [
  'ACoS',
  'Overall Unit Sold',
  'Overall Revenue',
  'TACOS',
  'Organic Unit Sold',
  'Organic Revenue',
  'NTB Unit Sold',
  'NTB Revenue',
];

const CAMPAIGN_GROUP_FILTERS = [
  { id: 'HIGH_ACOS', label: 'Top 10 High ACoS Campaigns' },
  { id: 'LOW_ACOS', label: 'Top 10 Low ACoS Campaigns' },
  { id: 'BEST_REVENUE', label: 'Top 10 Best Campaigns - Revenue' },
  { id: 'WORST_REVENUE', label: 'Top 10 Worst Campaigns - Revenue' },
];

function Skeleton({ width = '100%', height = 12, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: 10,
        background: 'linear-gradient(90deg, rgba(148,163,184,0.18), rgba(148,163,184,0.34), rgba(148,163,184,0.18))',
        backgroundSize: '200% 100%',
        animation: 'pattex-skeleton 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

export default function Marketing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [funnelTotals, setFunnelTotals] = useState(null);
  const [filters, setFilters] = useState({
    asin: '',
    productName: '',
    productCategory: '',
    packSize: '',
    salesChannel: 'Seller Central',
  });
  const allSalesChannels = useSalesChannels();
  const [dateFilterType, setDateFilterType] = useState('CURRENT_MONTH');
  const [comparison, setComparison] = useState(null);
  const [campaignFilters, setCampaignFilters] = useState({
    campaignType: '',
    salesChannel: 'Seller Central',
    dateRange: 'CURRENT_MONTH',
    campaignName: '',
    portfolio: '',
  });
  const [skuGroupFilter, setSkuGroupFilter] = useState('');
  const [skuViewOtherColumns, setSkuViewOtherColumns] = useState(
    OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [campaignOtherColumns, setCampaignOtherColumns] = useState(
    OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [campaignDetailOtherColumns, setCampaignDetailOtherColumns] = useState(
    CAMPAIGN_DETAIL_OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [campaignGroupFilter, setCampaignGroupFilter] = useState('');
  const [showCampaignDetailColumnPicker, setShowCampaignDetailColumnPicker] = useState(false);
  const [showSkuViewColumnPicker, setShowSkuViewColumnPicker] = useState(false);
  const [performanceCards, setPerformanceCards] = useState(['adSpend', 'overallRevenue', 'tacos', 'organicUnitSold']);
  const [campaignPerformanceCards, setCampaignPerformanceCards] = useState(['adSpend', 'overallRevenue', 'clicks', 'impressions']);
  const [skuPage, setSkuPage] = useState(1);
  const [skuPageSize, setSkuPageSize] = useState(20);
  const [latestUpdatedAtByChannel, setLatestUpdatedAtByChannel] = useState(null);
  const [showProcessing, setShowProcessing] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (hasLoadedOnce) setShowProcessing(true);
    const params = {};
    if (dateFilterType) params.dateFilterType = dateFilterType;
    if (filters.asin) params.asin = filters.asin;
    if (filters.productName) params.productName = filters.productName;
    if (filters.productCategory) params.productCategory = filters.productCategory;
    if (filters.packSize) params.packSize = filters.packSize;
    if (filters.salesChannel) params.salesChannel = filters.salesChannel;
    if (campaignFilters.dateRange) params.campaignDateRange = campaignFilters.dateRange;
    if (campaignFilters.campaignType) params.campaignType = campaignFilters.campaignType;
    if (campaignFilters.campaignName) params.campaignName = campaignFilters.campaignName;
    if (campaignFilters.portfolio) params.campaignPortfolio = campaignFilters.portfolio;
    if (campaignFilters.salesChannel) params.campaignSalesChannel = campaignFilters.salesChannel;

    const normalizeMarketingTotals = (resp) => {
      const metrics = resp?.metrics || {};
      const impressions = Number(metrics.impressions);
      const clicks = Number(metrics.clicks);
      const sales = Number(metrics.overallRevenue ?? metrics.total_sales);
      return {
        impressions: Number.isFinite(impressions) ? impressions : 0,
        clicks: Number.isFinite(clicks) ? clicks : 0,
        sales: Number.isFinite(sales) ? sales : 0,
      };
    };

    const baseFilterParams = {
      ...(filters.asin && { asin: filters.asin }),
      ...(filters.productName && { productName: filters.productName }),
      ...(filters.productCategory && { productCategory: filters.productCategory }),
      ...(filters.packSize && { packSize: filters.packSize }),
      ...(filters.salesChannel && { salesChannel: filters.salesChannel }),
    };

    Promise.all([
      dashboardApi.getMarketing(params),
      dashboardApi.getMarketing({ ...baseFilterParams, dateFilterType: 'CURRENT_MONTH' }),
      dashboardApi.getMarketing({ ...baseFilterParams, dateFilterType: 'PREVIOUS_MONTH' }),
    ])
      .then(([resp, currentMonthResp, previousMonthResp]) => {
        setData(resp);
        setComparison(resp?.comparison ?? null);
        setHasLoadedOnce(true);

        const current = normalizeMarketingTotals(currentMonthResp);
        const previous = normalizeMarketingTotals(previousMonthResp);
        setFunnelTotals({ current, previous });
      })
      .catch(() => {
        setData({
          title: 'Marketing',
          comingSoon: true,
          message: 'Marketing section – coming soon.',
        });
        setFunnelTotals(null);
      })
      .finally(() => {
        setLoading(false);
        setShowProcessing(false);
      });
  }, [
    dateFilterType,
    filters.asin,
    filters.productName,
    filters.productCategory,
    filters.packSize,
    filters.salesChannel,
    campaignFilters.dateRange,
    campaignFilters.campaignType,
    campaignFilters.campaignName,
    campaignFilters.portfolio,
    campaignFilters.salesChannel,
  ]);

  const metrics = data && !data.comingSoon && data.metrics ? data.metrics : {};
  const isProcessing = loading && hasLoadedOnce;

  const readFirst = (obj, keys) => {
    if (!obj) return undefined;
    for (const k of keys) {
      if (k == null) continue;
      if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
    }
    return undefined;
  };

  const readNumber = (obj, keys) => {
    const raw = readFirst(obj, keys);
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  const sumByKey = (rows, keys) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const keyList = Array.isArray(keys) ? keys : [keys];
    let sum = 0;
    let sawNumber = false;
    for (const r of rows) {
      if (!r) continue;
      for (const k of keyList) {
        if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
        const n = Number(r[k]);
        if (Number.isNaN(n)) continue;
        sum += n;
        sawNumber = true;
        break;
      }
    }
    return sawNumber ? sum : null;
  };

  const safePositive = (value) => {
    if (value == null) return null;
    const n = Number(value);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
  };

  const chartDataForTotals =
    data && !data.comingSoon && Array.isArray(data.chartData) && data.chartData.length > 0
      ? data.chartData
      : MARKETING_CHART_DATA;

  const adSpend = metrics.adSpend ?? '—';
  const adRevenuePerUnit = metrics.adRevenuePerUnit ?? '—';

  const adRevenueFromMetrics =
    safePositive(metrics.ads_sales) ??
    safePositive(metrics.adSales);
  const adRevenueFromSeries = safePositive(
    sumByKey(chartDataForTotals, ['ads_sales', 'adSales', 'ad_sales']),
  );
  const adRevenue =
    adRevenueFromMetrics ??
    adRevenueFromSeries ??
    adRevenuePerUnit;

  const overallRevenueFromMetrics =
    safePositive(metrics.total_sales) ??
    safePositive(metrics.overallRevenue);
  const overallRevenueFromSeries = safePositive(
    sumByKey(chartDataForTotals, ['total_sales', 'overallRevenue', 'totalSales']),
  );
  const overallRevenue =
    overallRevenueFromMetrics ??
    overallRevenueFromSeries ??
    '—';
  const overallRevenuePerUnit = metrics.overallRevenuePerUnit ?? '—';
  const tacos =
    metrics.tacos != null && !Number.isNaN(Number(metrics.tacos)) ? `${Number(metrics.tacos).toFixed(2)}%` : '—';

  const hasFiltersToClear =
    dateFilterType !== 'CURRENT_MONTH' ||
    filters.asin ||
    filters.productName ||
    filters.productCategory ||
    filters.packSize ||
    filters.salesChannel !== 'Seller Central';

  const clearAllFilters = () => {
    setFilters({ asin: '', productName: '', productCategory: '', packSize: '', salesChannel: 'Seller Central' });
    setDateFilterType('CURRENT_MONTH');
  };

  const kpiTrends = (() => {
    const fallback = { value: '—', type: 'neutral' };
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      const value = Number(pct);
      if (Number.isNaN(value)) return '—';
      if (value >= 0) return `↑${value.toFixed(2)}%`;
      return `↓${Math.abs(value).toFixed(2)}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    if (!comparison) {
      return {
        adSpend: fallback,
        adRevenuePerUnit: fallback,
        overallRevenue: fallback,
        overallRevenuePerUnit: fallback,
        tacos: fallback,
      };
    }
    return {
      adSpend: { value: fmt(comparison.adSpend?.pctChange), type: type(comparison.adSpend?.pctChange) },
      adRevenuePerUnit: { value: fmt(comparison.adRevenuePerUnit?.pctChange), type: type(comparison.adRevenuePerUnit?.pctChange) },
      overallRevenue: { value: fmt(comparison.overallRevenue?.pctChange), type: type(comparison.overallRevenue?.pctChange) },
      overallRevenuePerUnit: { value: fmt(comparison.overallRevenuePerUnit?.pctChange), type: type(comparison.overallRevenuePerUnit?.pctChange) },
      tacos: { value: fmt(comparison.tacos?.pctChange), type: type(comparison.tacos?.pctChange) },
    };
  })();

  useEffect(() => {
    let cancelled = false;
    const channel = filters.salesChannel ? String(filters.salesChannel).trim() : '';
    dashboardApi
      .getLatestUpdatedDate({ dataset: 'marketing', salesChannel: channel })
      .then((resp) => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(resp?.updatedAt ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(null);
      });
    return () => { cancelled = true; };
  }, [filters.salesChannel]);

  const dataUpdatedDate = (latestUpdatedAtByChannel || data?.updatedAt)
    ? formatDateDDMonYY(String(latestUpdatedAtByChannel || data.updatedAt).split('T')[0])
    : null;

  const chartData =
    data && !data.comingSoon && Array.isArray(data.chartData) && data.chartData.length > 0
      ? data.chartData
      : MARKETING_CHART_DATA;

  const campaignChartData =
    data && !data.comingSoon && Array.isArray(data.campaignChartData) && data.campaignChartData.length > 0
      ? data.campaignChartData
      : chartData;

  const toggleSkuViewOtherColumn = (col) => {
    setSkuViewOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleCampaignOtherColumn = (col) => {
    setCampaignOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleCampaignDetailOtherColumn = (col) => {
    setCampaignDetailOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const funnelMetricsData = useMemo(() => {
    const fmtInt = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString());
    const fmtAed = (n) =>
      n == null || !Number.isFinite(n)
        ? '—'
        : `AED ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const growthPct = (cur, prev) => {
      if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
      return ((cur - prev) / prev) * 100;
    };

    const current = funnelTotals?.current;
    const previous = funnelTotals?.previous;

    const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

    const curImpressions = safe(current?.impressions);
    const prevImpressions = safe(previous?.impressions);
    const curClicks = safe(current?.clicks);
    const prevClicks = safe(previous?.clicks);
    const curSales = safe(current?.sales);
    const prevSales = safe(previous?.sales);

    const rows = [
      {
        metric: 'Impressions',
        currentMonth: fmtInt(curImpressions),
        lastMonth: fmtInt(prevImpressions),
        growthValue: growthPct(curImpressions, prevImpressions),
      },
      {
        metric: 'Clicks',
        currentMonth: fmtInt(curClicks),
        lastMonth: fmtInt(prevClicks),
        growthValue: growthPct(curClicks, prevClicks),
      },
      {
        metric: 'Sales',
        currentMonth: fmtAed(curSales),
        lastMonth: fmtAed(prevSales),
        growthValue: growthPct(curSales, prevSales),
      },
    ];

    return rows.map((r) => ({
      metric: r.metric,
      currentMonth: r.currentMonth,
      lastMonth: r.lastMonth,
      growth:
        r.growthValue == null || Number.isNaN(r.growthValue)
          ? '—'
          : `${r.growthValue > 0 ? '↑' : r.growthValue < 0 ? '↓' : ''}${Math.abs(r.growthValue).toFixed(2)}%`,
      growthValue: r.growthValue,
    }));
  }, [funnelTotals]);
  const skuRows = (data && !data.comingSoon && Array.isArray(data.skuRows) ? data.skuRows : []);

  // Options for top Marketing filters, fetched from Marketing data (skuRows)
  const asinOptions = useMemo(
    () => Array.from(new Set(skuRows.map((r) => r.asin).filter(Boolean))),
    [skuRows],
  );
  const productNameOptions = useMemo(
    () => Array.from(new Set(skuRows.map((r) => r.productName).filter(Boolean))),
    [skuRows],
  );
  const productCategoryOptions = useMemo(
    () => Array.from(new Set(skuRows.map((r) => r.productCategory).filter(Boolean))),
    [skuRows],
  );
  const packSizeOptions = useMemo(
    () => Array.from(new Set(skuRows.map((r) => r.packSize).filter(Boolean))),
    [skuRows],
  );
  // Use API-provided list (all unique Sales Channels in DB) when available; else derive from skuRows
  const salesChannelOptions = useMemo(() => {
    if (allSalesChannels.length > 0) return allSalesChannels;
    if (data?.salesChannelOptions?.length > 0) return data.salesChannelOptions;
    return Array.from(new Set(skuRows.map((r) => r.salesChannel || r.channel).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
  }, [allSalesChannels, data?.salesChannelOptions, skuRows]);

  // Ensure the selected sales channel matches an available option on first render/load.
  useEffect(() => {
    if (!salesChannelOptions || salesChannelOptions.length === 0) return;
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const current = normalize(filters.salesChannel);
    const optionsNormalized = salesChannelOptions.map((c) => ({ raw: c, key: normalize(c) }));
    const hasExact = current && optionsNormalized.some((o) => o.key === current);
    if (hasExact) return;
    const preferred = optionsNormalized.find((o) => o.key === 'seller central');
    const next = (preferred?.raw || optionsNormalized[0]?.raw || '').toString();
    if (next && next !== filters.salesChannel) {
      setFilters((f) => ({ ...f, salesChannel: next }));
      setSkuPage(1);
    }
  }, [salesChannelOptions]);

  const displayedSkuRows = useMemo(() => {
    let base = [...skuRows];

    if (skuGroupFilter === 'BEST_REVENUE') {
      base.sort((a, b) => (Number(b.overallRevenue) || 0) - (Number(a.overallRevenue) || 0));
      base = base.slice(0, 10);
    } else if (skuGroupFilter === 'WORST_REVENUE') {
      base = base.filter((r) => (Number(r.overallRevenue) || 0) > 0);
      base.sort((a, b) => (Number(a.overallRevenue) || 0) - (Number(b.overallRevenue) || 0));
      base = base.slice(0, 10);
    }

    return base;
  }, [skuRows, skuGroupFilter]);

  const skuTotal = displayedSkuRows.length;
  const skuPageCount = Math.max(1, Math.ceil(skuTotal / skuPageSize));
  const safeSkuPage = Math.min(skuPage, skuPageCount);
  const skuStart = (safeSkuPage - 1) * skuPageSize;
  const skuEnd = skuStart + skuPageSize;
  const pagedSkuRows = displayedSkuRows.slice(skuStart, skuEnd);

  const campaignMetrics = data && !data.comingSoon && data.campaignMetrics ? data.campaignMetrics : {};
  const campaignAdSpend = campaignMetrics.adSpend ?? '—';
  const campaignChartDataForTotals =
    data && !data.comingSoon && Array.isArray(data.campaignChartData) && data.campaignChartData.length > 0
      ? data.campaignChartData
      : chartDataForTotals;
  const campaignAdRevenueFromMetrics =
    safePositive(campaignMetrics.ads_sales) ??
    safePositive(campaignMetrics.adSales);
  const campaignAdRevenueFromSeries = safePositive(
    sumByKey(campaignChartDataForTotals, ['ads_sales', 'adSales', 'ad_sales']),
  );
  const campaignAdRevenue =
    campaignAdRevenueFromMetrics ??
    campaignAdRevenueFromSeries ??
    campaignMetrics.adRevenuePerUnit ??
    '—';

  const campaignOverallRevenueFromMetrics =
    safePositive(campaignMetrics.total_sales) ??
    safePositive(campaignMetrics.overallRevenue);
  const campaignOverallRevenueFromSeries = safePositive(
    sumByKey(campaignChartDataForTotals, ['total_sales', 'overallRevenue', 'totalSales']),
  );
  const campaignOverallRevenue =
    campaignOverallRevenueFromMetrics ??
    campaignOverallRevenueFromSeries ??
    campaignMetrics.overallRevenuePerUnit ??
    '—';

  const campaignTacosFromSeries = (() => {
    const spend = sumByKey(campaignChartDataForTotals, ['adSpend', 'ads_spend', 'ad_spend']);
    const revenue = sumByKey(campaignChartDataForTotals, ['total_sales', 'overallRevenue', 'totalSales']);
    if (!spend || !revenue || Number.isNaN(spend) || Number.isNaN(revenue)) return null;
    const pct = (spend / revenue) * 100;
    return Number.isFinite(pct) ? pct : null;
  })();

  // Prefer campaign-level TACOS (respects campaign filters), then series-derived TACOS, then overall TACOS.
  const campaignTacos =
    campaignMetrics.tacos != null && !Number.isNaN(Number(campaignMetrics.tacos))
      ? `${Number(campaignMetrics.tacos).toFixed(2)}%`
      : campaignTacosFromSeries != null
      ? `${campaignTacosFromSeries.toFixed(2)}%`
      : tacos;

  const campaignRows = data && !data.comingSoon && Array.isArray(data.campaignRows) ? data.campaignRows : [];

  const campaignTypeOptions = useMemo(
    () => Array.from(new Set(campaignRows.map((r) => r.campaignType).filter(Boolean))),
    [campaignRows],
  );
  // Use same API list (all unique Sales Channels in DB) when available; else derive from campaign rows
  const campaignSalesChannelOptions = useMemo(() => {
    if (allSalesChannels.length > 0) return allSalesChannels;
    if (data?.salesChannelOptions?.length > 0) {
      return data.salesChannelOptions;
    }
    return Array.from(new Set(campaignRows.map((r) => r.salesChannel || r.channel).filter(Boolean))).sort((a, b) =>
      String(a).localeCompare(String(b)),
    );
  }, [allSalesChannels, data?.salesChannelOptions, campaignRows]);

  // Ensure the selected campaign sales channel matches an available option on first render/load.
  useEffect(() => {
    if (!campaignSalesChannelOptions || campaignSalesChannelOptions.length === 0) return;
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const current = normalize(campaignFilters.salesChannel);
    const optionsNormalized = campaignSalesChannelOptions.map((c) => ({ raw: c, key: normalize(c) }));
    const hasExact = current && optionsNormalized.some((o) => o.key === current);
    if (hasExact) return;
    const preferred = optionsNormalized.find((o) => o.key === 'seller central');
    const next = (preferred?.raw || optionsNormalized[0]?.raw || '').toString();
    if (next && next !== campaignFilters.salesChannel) {
      setCampaignFilters((f) => ({ ...f, salesChannel: next }));
    }
  }, [campaignSalesChannelOptions]);
  const campaignNameOptions = useMemo(
    () => Array.from(new Set(campaignRows.map((r) => r.campaignName).filter(Boolean))),
    [campaignRows],
  );
  const campaignPortfolioOptions = useMemo(
    () => Array.from(new Set(campaignRows.map((r) => r.portfolio).filter(Boolean))),
    [campaignRows],
  );

  const filteredCampaignRows = useMemo(() => {
    let base = [...campaignRows];

    if (campaignFilters.campaignType) {
      base = base.filter((r) => r.campaignType === campaignFilters.campaignType);
    }
    if (campaignFilters.campaignName) {
      base = base.filter((r) => r.campaignName === campaignFilters.campaignName);
    }
    if (campaignFilters.portfolio) {
      base = base.filter((r) => r.portfolio === campaignFilters.portfolio);
    }
    if (campaignFilters.salesChannel) {
      const normalize = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const selected = normalize(campaignFilters.salesChannel);
      base = base.filter((r) => normalize(r.salesChannel || r.channel || '') === selected);
    }
    if (campaignFilters.dateRange) {
      const range = getDateRangeForFilter(campaignFilters.dateRange);
      if (range) {
        // Per-campaign date is pre-filtered at backend via dateFilterType.
      }
    }

    if (campaignGroupFilter) {
      const byAcos = (row) => {
        const acos =
          readNumber(row, ['ACoS', 'acos', 'total_advertising_cost_of_sales_(acos)']) ??
          null;
        if (acos != null) return acos;
        const spend = readNumber(row, ['Ad Spend', 'adSpend', 'ads_spend', 'ad_spend', 'ads spend']);
        const adSales = readNumber(row, ['Ad Sales', 'adSales', 'ads_sales', 'ad_sales', 'ads sales']);
        if (spend != null && adSales != null && adSales > 0) return (spend / adSales) * 100;
        return 0;
      };
      const byRevenue = (row) => {
        const rev =
          readNumber(row, ['Overall Revenue', 'overallRevenue', 'total_sales', 'totalSales', 'sales']) ??
          null;
        if (rev != null) return rev;
        return 0;
      };
      if (campaignGroupFilter === 'HIGH_ACOS') {
        base = base
          .filter((r) => byAcos(r) > 0)
          .sort((a, b) => byAcos(b) - byAcos(a))
          .slice(0, 10);
      } else if (campaignGroupFilter === 'LOW_ACOS') {
        base = base
          .filter((r) => byAcos(r) > 0)
          .sort((a, b) => byAcos(a) - byAcos(b))
          .slice(0, 10);
      } else if (campaignGroupFilter === 'BEST_REVENUE') {
        base = base
          .filter((r) => byRevenue(r) > 0)
          .sort((a, b) => byRevenue(b) - byRevenue(a))
          .slice(0, 10);
      } else if (campaignGroupFilter === 'WORST_REVENUE') {
        base = base
          .filter((r) => byRevenue(r) > 0)
          .sort((a, b) => byRevenue(a) - byRevenue(b))
          .slice(0, 10);
      }
    }

    return base;
  }, [
    campaignRows,
    campaignFilters.campaignType,
    campaignFilters.campaignName,
    campaignFilters.portfolio,
    campaignFilters.salesChannel,
    campaignFilters.dateRange,
    campaignGroupFilter,
  ]);

  const handleDownloadCampaignData = () => {
    if (!filteredCampaignRows.length) return;
    const rows = filteredCampaignRows;
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) => {
            const value = row[key];
            if (value == null) return '';
            const str = String(value).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'campaign-marketing-data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getPerformanceMetricConfig = (id) =>
    PERFORMANCE_METRIC_OPTIONS.find((opt) => opt.id === id) || PERFORMANCE_METRIC_OPTIONS[0];

  const getPerformanceMetricValue = (id) => {
    const config = getPerformanceMetricConfig(id);
    const raw =
      metrics && Object.prototype.hasOwnProperty.call(metrics, id) ? metrics[id] : null;

    if (raw == null) return '—';

    if (typeof raw !== 'number') return raw;

    switch (config.format) {
      case 'currency':
        return `AED ${raw.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      case 'percent':
        return `${raw.toFixed(2)}%`;
      case 'integer':
      default:
        return raw.toLocaleString();
    }
  };

  const getCampaignPerformanceMetricValue = (id) => {
    const config = getPerformanceMetricConfig(id);
    const source =
      campaignMetrics && Object.prototype.hasOwnProperty.call(campaignMetrics, id)
        ? campaignMetrics
        : metrics;
    const raw =
      source && Object.prototype.hasOwnProperty.call(source, id) ? source[id] : null;

    if (raw == null) return '—';
    if (typeof raw !== 'number') return raw;

    switch (config.format) {
      case 'currency':
        return `AED ${raw.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      case 'percent':
        return `${raw.toFixed(2)}%`;
      case 'integer':
      default:
        return raw.toLocaleString();
    }
  };

  const formatAed = (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (value == null || Number.isNaN(num)) return value ?? '—';
    return `AED ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent2 = (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (value == null || Number.isNaN(num)) return value ?? '—';
    return `${num.toFixed(2)}%`;
  };

  const formatInt = (value) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (value == null || Number.isNaN(num)) return value ?? '—';
    return num.toLocaleString();
  };

  const formatCampaignTableCell = (col, value) => {
    const currencyCols = new Set([
      'CPC',
      'Ad Spend',
      'Ad Sales',
      'Overall Revenue',
      'Organic Revenue',
      'NTB Revenue',
    ]);
    const percentCols = new Set(['CTR', 'CVR', 'ACoS', 'TACOS']);
    const intCols = new Set([
      'Impressions',
      'Clicks',
      'Ad Unit Sold',
      'Overall Unit Sold',
      'Organic Unit Sold',
      'NTB Unit Sold',
    ]);

    if (currencyCols.has(col)) return formatAed(value);
    if (percentCols.has(col)) return formatPercent2(value);
    if (intCols.has(col)) return formatInt(value);
    return value ?? '—';
  };

  const handlePerformanceCardChange = (index, nextId) => {
    setPerformanceCards((prev) => {
      const updated = [...prev];
      updated[index] = nextId;
      return updated;
    });
  };

  const handleCampaignPerformanceCardChange = (index, nextId) => {
    setCampaignPerformanceCards((prev) => {
      const updated = [...prev];
      updated[index] = nextId;
      return updated;
    });
  };

  if (loading && !hasLoadedOnce) return <div className="section-muted">Loading...</div>;

  return (
    <>
      {/* local-only keyframes for skeleton shimmer */}
      <style>
        {`@keyframes pattex-skeleton { 0% { background-position: 0% 0%; } 100% { background-position: 200% 0%; } }`}
      </style>

      <div className="card marketing-filters-card">
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <select
              value={filters.asin}
              onChange={(e) => setFilters((f) => ({ ...f, asin: e.target.value }))}
              aria-label="ASIN"
            >
              <option value="">ASIN</option>
              {asinOptions.map((asin) => (
                <option key={asin} value={asin}>
                  {asin}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filters.productName}
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
              aria-label="Product Name"
            >
              <option value="">Product Name</option>
              {productNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filters.productCategory}
              onChange={(e) => setFilters((f) => ({ ...f, productCategory: e.target.value }))}
              aria-label="Product Category"
            >
              <option value="">Product Category</option>
              {productCategoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filters.packSize}
              onChange={(e) => setFilters((f) => ({ ...f, packSize: e.target.value }))}
              aria-label="Pack Size"
            >
              <option value="">Pack Size</option>
              {packSizeOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select
              value={filters.salesChannel}
              onChange={(e) => setFilters((f) => ({ ...f, salesChannel: e.target.value }))}
              aria-label="Sales Channel"
            >
              {salesChannelOptions.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group filter-group-date-with-clear">
            <div className="filter-date-with-clear">
              <select
                value={dateFilterType}
                onChange={(e) => setDateFilterType(e.target.value)}
                aria-label="Date Range"
              >
                {DATE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id || 'none'} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {hasFiltersToClear && (
                <button
                  type="button"
                  className="btn-clear-filter btn-clear-filter-icon"
                  onClick={clearAllFilters}
                  aria-label="Clear all filters"
                  title="Clear all filters"
                >
                  <svg className="btn-clear-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="exec-kpi-top">
          <h3 className="exec-kpi-title">Key Marketing Metrics</h3>
          {dataUpdatedDate && (
            <span className="exec-updated-text">
              <span className="pulse-dot" />
              Data updated as of <strong>{dataUpdatedDate}</strong>
            </span>
          )}
        </div>
        <div className="kpi-grid revenue-kpi-grid">
          <div className="kpi-item kpi-green">
            <div className="label">Ad Spend</div>
            <div className="value value-primary">
              {isProcessing ? (
                <Skeleton width={120} height={20} />
              ) : typeof adSpend === 'number' ? (
                `AED ${adSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                adSpend
              )}
              <span className={`kpi-trend-inline ${kpiTrends.adSpend.type === 'negative' ? 'negative' : kpiTrends.adSpend.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.adSpend.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div
            className="kpi-item kpi-blue"
            style={{
              borderRadius: 16,
              border: '1px solid rgba(148,163,184,0.28)',
              boxShadow: '0 14px 35px rgba(15,23,42,0.10)',
              alignItems: 'flex-start',
              padding: '16px 20px',
            }}
          >
            <div
              className="label"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#6b7280',
                marginBottom: 8,
              }}
            >
              Ad Revenue
            </div>
            <div
              className="value value-primary"
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                fontSize: 22,
              }}
            >
              <span>{isProcessing ? <Skeleton width={140} height={20} /> : typeof adRevenue === 'number'
                ? `AED ${adRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : adRevenue}</span>
              <span
                className={`kpi-trend-inline ${
                  kpiTrends.adRevenuePerUnit.type === 'negative'
                    ? 'negative'
                    : kpiTrends.adRevenuePerUnit.type === 'neutral'
                    ? 'neutral'
                    : ''
                }`}
                style={{ fontSize: 14 }}
              >
                ({kpiTrends.adRevenuePerUnit.value})
              </span>
            </div>
            <div
              className="value-secondary"
              style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}
            >
              vs last period
            </div>
          </div>
          <div
            className="kpi-item kpi-amber"
            style={{
              borderRadius: 16,
              border: '1px solid rgba(148,163,184,0.28)',
              boxShadow: '0 14px 35px rgba(15,23,42,0.10)',
              alignItems: 'flex-start',
              padding: '16px 20px',
            }}
          >
            <div
              className="label"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#6b7280',
                marginBottom: 8,
              }}
            >
              Overall Revenue
            </div>
            <div
              className="value value-primary"
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                fontSize: 22,
              }}
            >
              <span>{isProcessing ? <Skeleton width={160} height={20} /> : typeof overallRevenue === 'number'
                ? `AED ${overallRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : overallRevenue}</span>
              <span
                className={`kpi-trend-inline ${
                  kpiTrends.overallRevenue.type === 'negative'
                    ? 'negative'
                    : kpiTrends.overallRevenue.type === 'neutral'
                    ? 'neutral'
                    : ''
                }`}
                style={{ fontSize: 14 }}
              >
                ({kpiTrends.overallRevenue.value})
              </span>
            </div>
            <div
              className="value-secondary"
              style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}
            >
              vs last period
            </div>
          </div>
          <div className="kpi-item kpi-violet">
            <div className="label">TACOS</div>
            <div className="value value-primary">
              {isProcessing ? <Skeleton width={80} height={20} /> : tacos}
              <span className={`kpi-trend-inline ${kpiTrends.tacos.type === 'negative' ? 'negative' : kpiTrends.tacos.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.tacos.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
        </div>
      </div>

      <div className="marketing-graph-row">
        <div className="card" style={{ minHeight: 320, width: '100%' }}>
          <h3>Graph</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="kpi-grid revenue-kpi-grid" style={{ marginBottom: 4 }}>
              {performanceCards.map((metricId, index) => {
                const config = getPerformanceMetricConfig(metricId);
                const value = getPerformanceMetricValue(metricId);

                return (
                  <div
                    key={`${metricId}-${index}`}
                    className="kpi-item"
                    style={{ border: '1px solid rgba(148,163,184,0.35)' }}
                  >
                    <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: config.color,
                        }}
                      />
                      <select
                        value={metricId}
                        onChange={(e) => handlePerformanceCardChange(index, e.target.value)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          fontSize: 13,
                          fontWeight: 500,
                          padding: 0,
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {PERFORMANCE_METRIC_OPTIONS.map((opt) => (
                          <option
                            key={opt.id}
                            value={opt.id}
                            disabled={performanceCards.includes(opt.id) && opt.id !== metricId}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.6 }}>⌄</span>
                      <span
                        aria-hidden="true"
                        style={{
                          marginLeft: 4,
                          fontSize: 11,
                          borderRadius: '999px',
                          border: '1px solid rgba(148,163,184,0.7)',
                          width: 16,
                          height: 16,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        i
                      </span>
                    </div>
                    <div className="value">{value}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 16, right: 32, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke="#E5E7EB" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    tickFormatter={(v) =>
                      v == null
                        ? ''
                        : `AED ${Number(v).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                    }
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#2563eb' }}
                  />
                  <Tooltip content={<MarketingPerformanceTooltip />} />
                  {performanceCards.includes('impressions') && (
                    <Bar
                      yAxisId="right"
                      dataKey="impressions"
                      fill="#008296"
                      maxBarSize={48}
                      radius={[6, 6, 0, 0]}
                    />
                  )}
                  {performanceCards.map((metricId) => {
                    // Always keep bar-only for impressions; no line on top of it.
                    if (metricId === 'impressions') return null;

                    const config = getPerformanceMetricConfig(metricId);
                    const axisId = config.axis === 'left' ? 'left' : 'right';

                    return (
                      <Line
                        key={metricId}
                        type="monotone"
                        yAxisId={axisId}
                        dataKey={metricId}
                        stroke={config.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Pattex Sales Funnel */}
      <div className="card sales-funnel-card">
        <h3 className="sales-funnel-title">Pattex Sales Funnel</h3>
        <div className="sales-funnel-row">
          <div className="sales-funnel-viz">
            <div className="funnel-stage funnel-stage-1"><span>Impressions</span></div>
            <div className="funnel-stage funnel-stage-2"><span>CTR</span></div>
            <div className="funnel-stage funnel-stage-3"><span>CVR</span></div>
          </div>
          <div className="sales-funnel-metrics-wrap">
            <table
              className="data-table funnel-metrics-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1px solid #0f172a',
                background: '#ffffff',
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: '1px solid #0f172a', padding: '10px 12px', textAlign: 'left' }}>Metrics</th>
                  <th
                    className="col-num"
                    style={{ border: '1px solid #0f172a', padding: '10px 12px', textAlign: 'right' }}
                  >
                    Current Month
                  </th>
                  <th
                    className="col-num"
                    style={{ border: '1px solid #0f172a', padding: '10px 12px', textAlign: 'right' }}
                  >
                    Last Month
                  </th>
                  <th
                    className="col-num"
                    style={{ border: '1px solid #0f172a', padding: '10px 12px', textAlign: 'right' }}
                  >
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(funnelMetricsData) ? funnelMetricsData : FUNNEL_METRICS.map((m) => ({ metric: m, currentMonth: '', lastMonth: '', growth: '' }))).map((row, i) => (
                  <tr key={row.metric || i}>
                    <td style={{ border: '1px solid #0f172a', padding: '10px 12px' }}>{row.metric}</td>
                    <td className="col-num" style={{ border: '1px solid #0f172a', padding: '10px 12px' }}>
                      {row.currentMonth ?? '—'}
                    </td>
                    <td className="col-num" style={{ border: '1px solid #0f172a', padding: '10px 12px' }}>
                      {row.lastMonth ?? '—'}
                    </td>
                    <td
                      className="col-num"
                      style={{
                        border: '1px solid #0f172a',
                        padding: '10px 12px',
                        color:
                          row?.growthValue == null || Number.isNaN(row?.growthValue)
                            ? '#64748b'
                            : row.growthValue < 0
                            ? '#dc2626'
                            : '#16a34a',
                        fontWeight: 600,
                      }}
                    >
                      {row.growth ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed SKU Level Marketing View */}
      <div className="card">
        <h3>Detailed SKU Level Marketing View</h3>
        <div className="filter-toggle-row marketing-sku-toolbar">
          <div className="marketing-sku-toolbar-left">
            {SKU_GROUP_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn-chip ${skuGroupFilter === f.id ? 'active' : ''}`}
                onClick={() => {
                  setSkuGroupFilter((prev) => (prev === f.id ? '' : f.id));
                  setSkuPage(1);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="marketing-sku-toolbar-right">
            <div className="column-picker-wrap">
              <button
                type="button"
                className="btn-chip"
                onClick={() => setShowSkuViewColumnPicker((v) => !v)}
              >
                Columns
              </button>
              {showSkuViewColumnPicker && (
                <div className="column-picker">
                  {OTHER_COLUMNS.map((col) => (
                    <label key={col} className="column-picker-item">
                      <input
                        type="checkbox"
                        checked={!!skuViewOtherColumns[col]}
                        onChange={() => toggleSkuViewOtherColumn(col)}
                      />
                      {col}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {SKU_TABLE_COLUMNS.map((col) => (
                  <th key={col.id} className={col.id === 'last30Sales' || col.id === 'dos' || col.id === 'availableInventory' || col.id === 'impressions' || col.id === 'clicks' ? 'col-num' : ''}>
                    {col.label}
                  </th>
                ))}
                {OTHER_COLUMNS.filter((c) => skuViewOtherColumns[c]).map((col) => (
                  <th key={col} className="col-num">{col}</th>
                ))}
                <th className="cell-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayedSkuRows.length === 0 ? (
                <tr>
                  <td colSpan={SKU_TABLE_COLUMNS.length + OTHER_COLUMNS.filter((c) => skuViewOtherColumns[c]).length + 1} className="section-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No data
                  </td>
                </tr>
              ) : (
                pagedSkuRows.map((row, idx) => (
                  <tr key={row.id ?? idx}>
                    {SKU_TABLE_COLUMNS.map((col) => (
                      <td key={col.id} className={col.id === 'last30Sales' || col.id === 'dos' || col.id === 'availableInventory' || col.id === 'impressions' || col.id === 'clicks' ? 'col-num' : ''}>
                        {row[col.id] ?? '—'}
                      </td>
                    ))}
                    {OTHER_COLUMNS.filter((c) => skuViewOtherColumns[c]).map((col) => (
                      <td key={col} className="col-num">{col === 'Date' ? (row[col] ? formatDateDDMonYY(row[col]) : '—') : (row[col] ?? '—')}</td>
                    ))}
                    <td className="cell-actions">
                      <button type="button" className="btn-quick-actions" aria-label="Quick actions" title="Quick actions">⋮</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safeSkuPage}
          pageSize={skuPageSize}
          total={skuTotal}
          onPageChange={setSkuPage}
          onPageSizeChange={(size) => {
            setSkuPageSize(size);
            setSkuPage(1);
          }}
        />
      </div>

      {/* Detailed Campaign Level Marketing View – Filters (Campaign) */}
      <div className="card marketing-filters-card">
        <h3>Detailed Campaign Level Marketing View</h3>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Campaign Type</label>
            <select
              value={campaignFilters.campaignType}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, campaignType: e.target.value }))}
              aria-label="Campaign Type"
            >
              <option value="">All</option>
              {campaignTypeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Sales Channel</label>
            <select
              value={campaignFilters.salesChannel}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, salesChannel: e.target.value }))}
              aria-label="Sales Channel"
            >
              {campaignSalesChannelOptions.map((ch) => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
            {(showProcessing || isProcessing) && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Skeleton width={12} height={12} style={{ borderRadius: 999 }} />
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Loading…</span>
              </div>
            )}
          </div>
          <div className="filter-group">
            <label>Date Range</label>
            <select
              value={campaignFilters.dateRange}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, dateRange: e.target.value }))}
              aria-label="Date Range"
            >
              {DATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id || 'none'} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          {/* Download button hidden for now as requested */}
          <div className="filter-group">
            <label>Campaign Name</label>
            <select
              value={campaignFilters.campaignName}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, campaignName: e.target.value }))}
              aria-label="Campaign Name"
            >
              <option value="">All</option>
              {campaignNameOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Portfolio</label>
            <select
              value={campaignFilters.portfolio}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, portfolio: e.target.value }))}
              aria-label="Portfolio"
            >
              <option value="">All</option>
              {campaignPortfolioOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Campaign Level Hourly Marketing View */}
      <div className="card">
        <h3>Campaign Level Hourly Marketing View</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <div className="kpi-item kpi-green">
            <div className="label">Ad Spend</div>
            <div className="value value-primary">
              {isProcessing ? (
                <Skeleton width={120} height={20} />
              ) : typeof campaignAdSpend === 'number' ? (
                `AED ${campaignAdSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                campaignAdSpend
              )}
              <span className={`kpi-trend-inline ${kpiTrends.adSpend.type === 'negative' ? 'negative' : kpiTrends.adSpend.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.adSpend.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div className="kpi-item kpi-blue">
            <div className="label">Ad Revenue</div>
            <div className="value value-primary">
              {isProcessing ? (
                <Skeleton width={140} height={20} />
              ) : typeof campaignAdRevenue === 'number' ? (
                `AED ${campaignAdRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                campaignAdRevenue
              )}
              <span className={`kpi-trend-inline ${kpiTrends.adRevenuePerUnit.type === 'negative' ? 'negative' : kpiTrends.adRevenuePerUnit.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.adRevenuePerUnit.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div className="kpi-item kpi-amber">
            <div className="label">Overall Revenue</div>
            <div className="value value-primary">
              {isProcessing ? (
                <Skeleton width={160} height={20} />
              ) : typeof campaignOverallRevenue === 'number' ? (
                `AED ${campaignOverallRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                campaignOverallRevenue
              )}
              <span className={`kpi-trend-inline ${kpiTrends.overallRevenue.type === 'negative' ? 'negative' : kpiTrends.overallRevenue.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.overallRevenue.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div className="kpi-item kpi-violet">
            <div className="label">TACOS</div>
            <div className="value value-primary">
              {isProcessing ? <Skeleton width={80} height={20} /> : campaignTacos}
              <span className={`kpi-trend-inline ${kpiTrends.tacos.type === 'negative' ? 'negative' : kpiTrends.tacos.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.tacos.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
        </div>
        <div className="marketing-graph-row">
          <div className="card" style={{ minHeight: 320, width: '100%' }}>
            <h3>Graph</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="kpi-grid revenue-kpi-grid" style={{ marginBottom: 4 }}>
                {campaignPerformanceCards.map((metricId, index) => {
                  const config = getPerformanceMetricConfig(metricId);
                  const value = getCampaignPerformanceMetricValue(metricId);
                  return (
                    <div
                      key={`${metricId}-${index}`}
                      className="kpi-item"
                      style={{ border: '1px solid rgba(148,163,184,0.35)' }}
                    >
                      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: config.color,
                          }}
                        />
                        <select
                          value={metricId}
                          onChange={(e) => handleCampaignPerformanceCardChange(index, e.target.value)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: 13,
                            fontWeight: 500,
                            padding: 0,
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {PERFORMANCE_METRIC_OPTIONS.map((opt) => (
                            <option
                              key={opt.id}
                              value={opt.id}
                              disabled={campaignPerformanceCards.includes(opt.id) && opt.id !== metricId}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.6 }}>⌄</span>
                      </div>
                      <div className="value">{value}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={campaignChartData}
                    margin={{ top: 16, right: 32, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="#E5E7EB" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#4b5563' }}
                      tickFormatter={(v) =>
                        v == null
                          ? ''
                          : `AED ${Number(v).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                      }
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#2563eb' }}
                    />
                    <Tooltip content={<MarketingPerformanceTooltip />} />
                    {campaignPerformanceCards.includes('impressions') && (
                      <Bar
                        yAxisId="right"
                        dataKey="impressions"
                        fill="#008296"
                        maxBarSize={48}
                        radius={[6, 6, 0, 0]}
                      />
                    )}
                    {campaignPerformanceCards.map((metricId) => {
                      if (metricId === 'impressions') return null;
                      const config = getPerformanceMetricConfig(metricId);
                      const axisId = config.axis === 'left' ? 'left' : 'right';
                      return (
                        <Line
                          key={metricId}
                          type="monotone"
                          yAxisId={axisId}
                          dataKey={metricId}
                          stroke={config.color}
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Campaign Level Marketing View – Campaign Table */}
      <div className="card">
        <h3>Detailed Campaign Level Marketing View</h3>

        <div className="filter-toggle-row" style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
          <div
            className="marketing-sku-toolbar-left"
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: '0.5rem',
              overflowX: 'auto',
            }}
          >
            {CAMPAIGN_GROUP_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn-chip ${campaignGroupFilter === f.id ? 'active' : ''}`}
                onClick={() =>
                  setCampaignGroupFilter((prev) => (prev === f.id ? '' : f.id))
                }
              >
                {f.label}
              </button>
            ))}
            <div className="column-picker-wrap">
            <button
              type="button"
              className="btn-chip"
              onClick={() => setShowCampaignDetailColumnPicker((v) => !v)}
            >
              Columns
            </button>
            {showCampaignDetailColumnPicker && (
              <div className="column-picker">
                {CAMPAIGN_DETAIL_OTHER_COLUMNS.map((col) => (
                  <label key={col} className="column-picker-item">
                    <input
                      type="checkbox"
                      checked={!!campaignDetailOtherColumns[col]}
                      onChange={() => toggleCampaignDetailOtherColumn(col)}
                    />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign Type</th>
                <th>Campaign Name</th>
                <th className="col-num">Impressions</th>
                <th className="col-num">Clicks</th>
                <th className="col-num">CTR</th>
                <th className="col-num">CPC</th>
                <th className="col-num">CVR</th>
                <th className="col-num">Ad Spend</th>
                <th className="col-num">Ad Unit Sold</th>
                <th className="col-num">Ad Sales</th>
                {CAMPAIGN_DETAIL_OTHER_COLUMNS.filter((c) => campaignDetailOtherColumns[c]).map((col) => (
                  <th key={col} className="col-num">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isProcessing ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td><Skeleton height={12} /></td>
                    <td><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    <td className="col-num"><Skeleton height={12} /></td>
                    {CAMPAIGN_DETAIL_OTHER_COLUMNS.filter((c) => campaignDetailOtherColumns[c]).map((col) => (
                      <td key={`${col}-${i}`} className="col-num">
                        <Skeleton height={12} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredCampaignRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      10 + CAMPAIGN_DETAIL_OTHER_COLUMNS.filter((c) => campaignDetailOtherColumns[c]).length
                    }
                    className="section-muted"
                    style={{ textAlign: 'center', padding: '2rem' }}
                  >
                    No data
                  </td>
                </tr>
              ) : (
                filteredCampaignRows.map((row, idx) => (
                  <tr key={row.id ?? idx}>
                    <td>{row.campaignType ?? '—'}</td>
                    <td>{row.campaignName ?? '—'}</td>
                    <td className="col-num">{formatCampaignTableCell('Impressions', readFirst(row, ['impressions', 'Impressions']))}</td>
                    <td className="col-num">{formatCampaignTableCell('Clicks', readFirst(row, ['clicks', 'Clicks']))}</td>
                    <td className="col-num">{formatCampaignTableCell('CTR', readFirst(row, ['CTR', 'ctr', 'click_thru_rate_(ctr)', 'click_thru_rate', 'click_through_rate']))}</td>
                    <td className="col-num">{formatCampaignTableCell('CPC', readFirst(row, ['CPC', 'cpc', 'cost_per_click_(cpc)', 'cost_per_click', 'costPerClick']))}</td>
                    <td className="col-num">{formatCampaignTableCell('CVR', readFirst(row, ['CVR', 'cvr', 'conversion_rate', 'cvr_(%)', 'cvr%']))}</td>
                    <td className="col-num">{formatCampaignTableCell('Ad Spend', readFirst(row, ['Ad Spend', 'adSpend', 'ads_spend', 'ad_spend']))}</td>
                    <td className="col-num">{formatCampaignTableCell('Ad Unit Sold', readFirst(row, ['Ad Unit Sold', 'adUnitSold', 'ads_unit_sold', 'ad_unit_sold']))}</td>
                    <td className="col-num">{formatCampaignTableCell('Ad Sales', readFirst(row, ['Ad Sales', 'adSales', 'ads_sales', 'ad_sales']))}</td>
                    {CAMPAIGN_DETAIL_OTHER_COLUMNS.filter((c) => campaignDetailOtherColumns[c]).map((col) => (
                      <td key={col} className="col-num">
                        {(() => {
                          // Allow both backend-friendly labels and raw DB keys.
                          const direct =
                            readFirst(row, [col]) ??
                            (col === 'TACOS' ? readFirst(row, ['TACoS', 'tacos']) : undefined);
                          if (direct != null) return formatCampaignTableCell(col, direct);

                          // Compute TACOS/ACoS if backend sent only raw spend/sales.
                          if (col === 'TACOS') {
                            const spend = readNumber(row, ['Ad Spend', 'adSpend', 'ads_spend', 'ad_spend']);
                            const rev = readNumber(row, ['Overall Revenue', 'overallRevenue', 'total_sales', 'totalSales', 'sales']);
                            if (spend != null && rev != null && rev > 0) return formatCampaignTableCell(col, (spend / rev) * 100);
                          }
                          if (col === 'ACoS') {
                            const spend = readNumber(row, ['Ad Spend', 'adSpend', 'ads_spend', 'ad_spend']);
                            const adSales = readNumber(row, ['Ad Sales', 'adSales', 'ads_sales', 'ad_sales']);
                            if (spend != null && adSales != null && adSales > 0) return formatCampaignTableCell(col, (spend / adSales) * 100);
                          }

                          return formatCampaignTableCell(col, undefined);
                        })()}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
