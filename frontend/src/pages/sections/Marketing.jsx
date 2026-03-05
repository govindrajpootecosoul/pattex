import { useState, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Bar } from 'recharts';
import { dashboardApi } from '../../api/api';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
  { id: 'CUSTOM_RANGE', label: 'Custom Range' },
];

const SALES_CHANNEL_OPTIONS = [
  { id: '', label: 'All' },
  { id: 'OVERALL', label: 'Overall' },
  { id: 'VC', label: 'VC' },
  { id: 'SC', label: 'SC' },
];

const OTHER_COLUMNS = [
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
  'TACoS',
  'Organic Unit Sold',
  'Organic Revenue',
  'NTB Unit Sold',
  'NTB Revenue',
];

const FUNNEL_METRICS = ['Impressions', 'Clicks', 'Sales', 'Repeat Customers'];

const SKU_GROUP_FILTERS = [
  { id: 'HIGH_ACOS', label: 'Top 10 High ACoS SKUs' },
  { id: 'HIGH_TACOS', label: 'Top 10 High TACOS SKUs' },
  { id: 'BEST_REVENUE', label: 'Top 10 Best Performers - Revenue' },
  { id: 'WORST_REVENUE', label: 'Top 10 Worst Performers - Revenue' },
];

const MARKETING_CHART_DATA = [
  {
    month: 'Jan 2026',
    totalCost: 800,
    impressions: 80000,
    cpc: 1.4,
    roas: 1.4,
  },
  {
    month: 'Feb 2026',
    totalCost: 1600,
    impressions: 180000,
    cpc: 1.9,
    roas: 1.1,
  },
  {
    month: 'Mar 2026',
    totalCost: 450,
    impressions: 38000,
    cpc: 1.7,
    roas: 1.9,
  },
];

const PERFORMANCE_METRIC_OPTIONS = [
  { id: 'impressions', label: 'Impressions', color: '#008296', format: 'integer' },
  { id: 'clicks', label: 'Clicks', color: '#60a5fa', format: 'integer' },
  { id: 'ctr', label: 'CTR', color: '#f97316', format: 'percent' },
  { id: 'cpc', label: 'CPC', color: '#d0137a', format: 'currency' },
  { id: 'cvr', label: 'CVR', color: '#22c55e', format: 'percent' },
  { id: 'adSpend', label: 'Ad Spend', color: '#7d38cc', format: 'currency' },
  { id: 'adUnitSold', label: 'Ad Unit Sold', color: '#0ea5e9', format: 'integer' },
  { id: 'adSales', label: 'Ad Sales', color: '#6366f1', format: 'currency' },
  { id: 'acos', label: 'ACoS', color: '#4285f4', format: 'percent' },
  { id: 'overallUnitSold', label: 'Overall Unit Sold', color: '#10b981', format: 'integer' },
  { id: 'overallRevenue', label: 'Overall Revenue', color: '#14b8a6', format: 'currency' },
  { id: 'tacos', label: 'TACoS', color: '#facc15', format: 'percent' },
  { id: 'organicUnitSold', label: 'Organic Unit Sold', color: '#4ade80', format: 'integer' },
  { id: 'organicRevenue', label: 'Organic Revenue', color: '#2dd4bf', format: 'currency' },
  { id: 'ntbUnitSold', label: 'NTB Unit Sold', color: '#a855f7', format: 'integer' },
  { id: 'ntbRevenue', label: 'NTB Revenue', color: '#ec4899', format: 'currency' },
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
          <span style={{ fontWeight: 600 }}>{point.totalCost != null ? `$${point.totalCost.toLocaleString()}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#008296' }} />
            Impressions
          </span>
          <span style={{ fontWeight: 600 }}>{point.impressions != null ? point.impressions.toLocaleString() : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#d0137a' }} />
            CPC
          </span>
          <span style={{ fontWeight: 600 }}>{point.cpc != null ? `$${point.cpc.toFixed(2)}` : '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#4285f4' }} />
            ROAS
          </span>
          <span style={{ fontWeight: 600 }}>{point.roas != null ? point.roas.toFixed(2) : '—'}</span>
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
  'TACoS',
  'Organic Unit Sold',
  'Organic Revenue',
  'NTB Unit Sold',
  'NTB Revenue',
];

export default function Marketing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    asin: '',
    productName: '',
    productCategory: '',
    packSize: '',
    salesChannel: '',
  });
  const [dateFilterType, setDateFilterType] = useState('');
  const [skuViewFilters, setSkuViewFilters] = useState({
    allSkus: '',
    channelFilter: '',
    dateRange: '',
  });
  const [skuGroupFilter, setSkuGroupFilter] = useState('');
  const [skuViewOtherColumns, setSkuViewOtherColumns] = useState(
    OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [campaignFilters, setCampaignFilters] = useState({
    campaignType: '',
    campaignName: '',
    portfolio: '',
    salesChannel: '',
    dateRange: '',
  });
  const [campaignOtherColumns, setCampaignOtherColumns] = useState(
    OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [campaignDetailOtherColumns, setCampaignDetailOtherColumns] = useState(
    CAMPAIGN_DETAIL_OTHER_COLUMNS.reduce((acc, col) => ({ ...acc, [col]: false }), {}),
  );
  const [showCampaignDetailColumnPicker, setShowCampaignDetailColumnPicker] = useState(false);
  const [showSkuViewColumnPicker, setShowSkuViewColumnPicker] = useState(false);
  const [performanceCards, setPerformanceCards] = useState(['adSpend', 'impressions', 'cpc', 'acos']);

  useEffect(() => {
    dashboardApi
      .getMarketing()
      .then(setData)
      .catch(() =>
        setData({
          title: 'Marketing',
          comingSoon: true,
          message: 'Marketing section – coming soon.',
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  const metrics = data && !data.comingSoon && data.metrics ? data.metrics : {};
  const adSpend = metrics.adSpend ?? '—';
  const adRevenuePerUnit = metrics.adRevenuePerUnit ?? '—';
  const overallRevenuePerUnit = metrics.overallRevenuePerUnit ?? '—';
  const acos = metrics.acos != null ? `${metrics.acos}%` : '—';

  const dataUpdatedDate =
    data?.updatedAt ? new Date(data.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '23rd Feb 2025';

  const toggleSkuViewOtherColumn = (col) => {
    setSkuViewOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleCampaignOtherColumn = (col) => {
    setCampaignOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const toggleCampaignDetailOtherColumn = (col) => {
    setCampaignDetailOtherColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const funnelMetricsData = data && !data.comingSoon && data.funnelMetrics
    ? data.funnelMetrics
    : FUNNEL_METRICS.map((m) => ({ metric: m, currentMonth: '', lastMonth: '', growth: '' }));
  const skuRows = (data && !data.comingSoon && Array.isArray(data.skuRows) ? data.skuRows : []);

  const campaignMetrics = data && !data.comingSoon && data.campaignMetrics ? data.campaignMetrics : {};
  const campaignAdSpend = campaignMetrics.adSpend ?? '—';
  const campaignAdRevenuePerUnit = campaignMetrics.adRevenuePerUnit ?? '—';
  const campaignOverallRevenuePerUnit = campaignMetrics.overallRevenuePerUnit ?? '—';
  const campaignAcos = campaignMetrics.acos != null ? `${campaignMetrics.acos}%` : '—';

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
        return `$${raw.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${raw.toFixed(2)}%`;
      case 'integer':
      default:
        return raw.toLocaleString();
    }
  };

  const handlePerformanceCardChange = (index, nextId) => {
    setPerformanceCards((prev) => {
      const updated = [...prev];
      updated[index] = nextId;
      return updated;
    });
  };

  if (loading) return <div className="section-muted">Loading...</div>;

  return (
    <>
      <div className="exec-header-row" style={{ marginBottom: '0.5rem' }}>
        <span className="exec-updated-text">Data updated as of {dataUpdatedDate}</span>
      </div>
      <h2 className="section-title">Pattex Marketing Dashboard</h2>

      <div className="card marketing-filters-card">
        <h3>Filters</h3>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>ASIN</label>
            <input
              type="text"
              placeholder="ASIN"
              value={filters.asin}
              onChange={(e) => setFilters((f) => ({ ...f, asin: e.target.value }))}
              aria-label="ASIN"
            />
          </div>
          <div className="filter-group">
            <label>Product Name</label>
            <input
              type="text"
              placeholder="Product Name"
              value={filters.productName}
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
              aria-label="Product Name"
            />
          </div>
          <div className="filter-group">
            <label>Product Category</label>
            <input
              type="text"
              placeholder="Product Category"
              value={filters.productCategory}
              onChange={(e) => setFilters((f) => ({ ...f, productCategory: e.target.value }))}
              aria-label="Product Category"
            />
          </div>
          <div className="filter-group">
            <label>Pack Size</label>
            <input
              type="text"
              placeholder="Pack Size"
              value={filters.packSize}
              onChange={(e) => setFilters((f) => ({ ...f, packSize: e.target.value }))}
              aria-label="Pack Size"
            />
          </div>
          <div className="filter-group">
            <label>Sales Channel (Overall/VC/SC)</label>
            <select
              value={filters.salesChannel}
              onChange={(e) => setFilters((f) => ({ ...f, salesChannel: e.target.value }))}
              aria-label="Sales Channel"
            >
              {SALES_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Date Range</label>
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
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Key Marketing Metrics</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <div className="kpi-item kpi-green">
            <div className="label">Ad Spend</div>
            <div className="value">{typeof adSpend === 'number' ? adSpend.toLocaleString() : adSpend}</div>
          </div>
          <div className="kpi-item kpi-blue">
            <div className="label">Ad Revenue/Unit</div>
            <div className="value">{typeof adRevenuePerUnit === 'number' ? adRevenuePerUnit.toLocaleString() : adRevenuePerUnit}</div>
          </div>
          <div className="kpi-item kpi-amber">
            <div className="label">Overall Revenue/Unit</div>
            <div className="value">{typeof overallRevenuePerUnit === 'number' ? overallRevenuePerUnit.toLocaleString() : overallRevenuePerUnit}</div>
          </div>
          <div className="kpi-item kpi-violet">
            <div className="label">ACoS</div>
            <div className="value">{acos}</div>
          </div>
        </div>
      </div>

      <div className="exec-lower-row">
        <div className="card" style={{ minHeight: 320, flex: 1, minWidth: 0 }}>
          <h3>Graph – Follow pattern same as Amazon (Line vs Bar)</h3>
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
                  data={MARKETING_CHART_DATA}
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
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#2563eb' }}
                  />
                  <Tooltip content={<MarketingPerformanceTooltip />} />
                  <Bar
                    yAxisId="right"
                    dataKey="impressions"
                    fill="#008296"
                    maxBarSize={48}
                    radius={[6, 6, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="totalCost"
                    stroke="#7d38cc"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    yAxisId="left"
                    dataKey="cpc"
                    stroke="#d0137a"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    yAxisId="right"
                    dataKey="roas"
                    stroke="#4285f4"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
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
            <div className="funnel-stage funnel-stage-4"><span>Repeat Purchase</span></div>
          </div>
          <div className="sales-funnel-metrics-wrap">
            <table className="data-table funnel-metrics-table">
              <thead>
                <tr>
                  <th>Metrics</th>
                  <th className="col-num">Current Month</th>
                  <th className="col-num">Last Month</th>
                  <th className="col-num">Growth</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(funnelMetricsData) ? funnelMetricsData : FUNNEL_METRICS.map((m) => ({ metric: m, currentMonth: '', lastMonth: '', growth: '' }))).map((row, i) => (
                  <tr key={row.metric || i}>
                    <td>{row.metric}</td>
                    <td className="col-num">{row.currentMonth ?? '—'}</td>
                    <td className="col-num">{row.lastMonth ?? '—'}</td>
                    <td className="col-num">{row.growth ?? '—'}</td>
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
        <div className="marketing-sku-filters">
          <div className="filter-row filter-row-one">
            <div className="filter-group marketing-sku-filter-all">
              <label>All SKUs</label>
              <input
                type="text"
                placeholder="All SKUs"
                value={skuViewFilters.allSkus}
                onChange={(e) => setSkuViewFilters((f) => ({ ...f, allSkus: e.target.value }))}
                aria-label="All SKUs"
              />
            </div>
            <div className="filter-group">
              <label>Channel Filter</label>
              <select
                value={skuViewFilters.channelFilter}
                onChange={(e) => setSkuViewFilters((f) => ({ ...f, channelFilter: e.target.value }))}
                aria-label="Channel Filter"
              >
                <option value="">All</option>
                {SALES_CHANNEL_OPTIONS.filter((o) => o.id).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Date Range</label>
              <select
                value={skuViewFilters.dateRange}
                onChange={(e) => setSkuViewFilters((f) => ({ ...f, dateRange: e.target.value }))}
                aria-label="Date Range"
              >
                {DATE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.id || 'none'} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="filter-toggle-row">
          {SKU_GROUP_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn-chip ${skuGroupFilter === f.id ? 'active' : ''}`}
              onClick={() => setSkuGroupFilter(skuGroupFilter === f.id ? '' : f.id)}
            >
              {f.label}
            </button>
          ))}
          <div className="column-picker-wrap" style={{ marginLeft: 'auto' }}>
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
              {skuRows.length === 0 ? (
                <tr>
                  <td colSpan={SKU_TABLE_COLUMNS.length + OTHER_COLUMNS.filter((c) => skuViewOtherColumns[c]).length + 1} className="section-muted" style={{ textAlign: 'center', padding: '2rem' }}>
                    No data
                  </td>
                </tr>
              ) : (
                skuRows.map((row, idx) => (
                  <tr key={row.id ?? idx}>
                    {SKU_TABLE_COLUMNS.map((col) => (
                      <td key={col.id} className={col.id === 'last30Sales' || col.id === 'dos' || col.id === 'availableInventory' || col.id === 'impressions' || col.id === 'clicks' ? 'col-num' : ''}>
                        {row[col.id] ?? '—'}
                      </td>
                    ))}
                    {OTHER_COLUMNS.filter((c) => skuViewOtherColumns[c]).map((col) => (
                      <td key={col} className="col-num">{row[col] ?? '—'}</td>
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
      </div>

      {/* Detailed Campaign Level Marketing View */}
      <div className="card marketing-filters-card">
        <h3>Detailed Campaign Level Marketing View</h3>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Filters</label>
            <input type="text" placeholder="Filters" aria-label="Filters" />
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
        </div>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Campaign Type</label>
            <input
              type="text"
              placeholder="Campaign Type"
              value={campaignFilters.campaignType}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, campaignType: e.target.value }))}
              aria-label="Campaign Type"
            />
          </div>
          <div className="filter-group">
            <label>Campaign Name</label>
            <input
              type="text"
              placeholder="Campaign Name"
              value={campaignFilters.campaignName}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, campaignName: e.target.value }))}
              aria-label="Campaign Name"
            />
          </div>
          <div className="filter-group">
            <label>Portfolio</label>
            <input
              type="text"
              placeholder="Portfolio"
              value={campaignFilters.portfolio}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, portfolio: e.target.value }))}
              aria-label="Portfolio"
            />
          </div>
          <div className="filter-group">
            <label>Sales Channel (Overall/VC/SC)</label>
            <select
              value={campaignFilters.salesChannel}
              onChange={(e) => setCampaignFilters((f) => ({ ...f, salesChannel: e.target.value }))}
              aria-label="Sales Channel"
            >
              {SALES_CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.id || 'all'} value={opt.id}>{opt.label}</option>
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
            <div className="value">{typeof campaignAdSpend === 'number' ? campaignAdSpend.toLocaleString() : campaignAdSpend}</div>
          </div>
          <div className="kpi-item kpi-blue">
            <div className="label">Ad Revenue/Unit</div>
            <div className="value">{typeof campaignAdRevenuePerUnit === 'number' ? campaignAdRevenuePerUnit.toLocaleString() : campaignAdRevenuePerUnit}</div>
          </div>
          <div className="kpi-item kpi-amber">
            <div className="label">Overall Revenue/Unit</div>
            <div className="value">{typeof campaignOverallRevenuePerUnit === 'number' ? campaignOverallRevenuePerUnit.toLocaleString() : campaignOverallRevenuePerUnit}</div>
          </div>
          <div className="kpi-item kpi-violet">
            <div className="label">ACoS</div>
            <div className="value">{campaignAcos}</div>
          </div>
        </div>
        <div className="exec-lower-row">
          <div className="card" style={{ minHeight: 320, flex: 1, minWidth: 0 }}>
            <h3>Graph – Follow pattern same as Amazon (Line vs Bar)</h3>
            <div
              className="section-muted"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 280,
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
              }}
            >
              Chart area – Line vs Bar
            </div>
          </div>
          <div className="card marketing-other-columns-card">
            <h3>Other Column</h3>
            <div className="marketing-other-columns-list">
              {OTHER_COLUMNS.map((col) => (
                <label key={col} className="column-picker-item">
                  <input
                    type="checkbox"
                    checked={!!campaignOtherColumns[col]}
                    onChange={() => toggleCampaignOtherColumn(col)}
                  />
                  {col}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Campaign Level Marketing View – Campaign Table */}
      <div className="card">
        <h3>Detailed Campaign Level Marketing View</h3>

        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Campaign Type</label>
            <input type="text" placeholder="Campaign Type" />
          </div>
          <div className="filter-group">
            <label>Channel Filter</label>
            <input type="text" placeholder="Channel Filter" />
          </div>
          <div className="filter-group">
            <label>Date Range</label>
            <select>
              {DATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id || 'none'} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Download Data</label>
            <button type="button" className="btn-primary-soft">
              Download
            </button>
          </div>
        </div>

        <div className="filter-toggle-row">
          <button type="button" className="btn-chip">Top 10 High ACoS Campaigns</button>
          <button type="button" className="btn-chip">Top 10 Low ACoS Campaigns</button>
          <button type="button" className="btn-chip">Top 10 Best Campaigns – Revenue</button>
          <button type="button" className="btn-chip">Top 10 Worst Campaigns – Revenue</button>

          <div className="column-picker-wrap" style={{ marginLeft: 'auto' }}>
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
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
