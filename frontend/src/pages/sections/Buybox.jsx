import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
];

const STOCK_FILTERS = [
  { id: 'NO_BUYBOX', label: 'SKUs with no Buybox' },
  { id: 'ALL_SKUS', label: 'All SKUs' },
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

export default function Buybox() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    packSize: '',
    channel: '',
  });
  const [stockFilter, setStockFilter] = useState('ALL_SKUS');
  const [dateFilterType, setDateFilterType] = useState('CURRENT_MONTH');
  const [comparison, setComparison] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState({
    asin: true,
    productName: true,
    category: true,
    packSize: true,
    channel: true,
    availableInventory: true,
    last30DaysSales: true,
    dos: true,
    moq: true,
    idealVcPrice: true,
    idealScPrice: false,
    currentBuyboxOwner: false,
    currentBuyboxPrice: false,
    currentVcPrice: false,
    currentScPrice: false,
    hijacker1: false,
    hijacker2: false,
    hijacker3: false,
    actionRequired: true,
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (dateFilterType) params.dateFilterType = dateFilterType;
    dashboardApi
      .getBuybox(params)
      .then((data) => {
        const apiRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(apiRows);
        setComparison(data?.comparison ?? null);
      })
      .catch((e) => {
        setError(e.message);
        setComparison(null);
      })
      .finally(() => setLoading(false));
  }, [dateFilterType]);

  const asinOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.asin).filter(Boolean))),
    [rows],
  );
  const productNameOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.productName).filter(Boolean))),
    [rows],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => r.productCategory)
            .filter(Boolean),
        ),
      ),
    [rows],
  );
  const packSizeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.packSize).filter(Boolean))),
    [rows],
  );
  const channelOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.salesChannel || r.channel).filter(Boolean))),
    [rows],
  );

  const dateRange = getDateRangeForFilter(dateFilterType);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        if (q) {
          const searchable = [
            row.asin,
            row.productName,
            row.productCategory,
            row.packSize,
            row.channel,
          ]
            .filter(Boolean)
            .map((s) => String(s).toLowerCase());
          if (!searchable.some((s) => s.includes(q))) {
            return false;
          }
        }
      }
      if (filters.asin && row.asin !== filters.asin) return false;
      if (filters.productName && row.productName !== filters.productName) return false;
      if (filters.category && row.productCategory !== filters.category) return false;
      if (filters.packSize && row.packSize !== filters.packSize) return false;
      const channelValue = row.salesChannel || row.channel;
      if (filters.channel && channelValue !== filters.channel) return false;

      if (stockFilter === 'NO_BUYBOX' && row.hasBuybox) return false;

      if (dateRange && row.reportMonth) {
        if (row.reportMonth < dateRange.start || row.reportMonth > dateRange.end) return false;
      }

      return true;
    });
  }, [rows, filters, stockFilter, dateRange]);

  const summary = useMemo(() => {
    if (!filteredRows.length) {
      return {
        overallBuyboxPct: 0,
        noBuyboxSkus: 0,
      };
    }
    const total = filteredRows.length;
    const withBuybox = filteredRows.filter((r) => r.hasBuybox).length;
    const noBuybox = total - withBuybox;
    return {
      overallBuyboxPct: Math.round((withBuybox / total) * 100),
      noBuyboxSkus: noBuybox,
    };
  }, [filteredRows]);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDateFilterChange = (e) => {
    setDateFilterType(e.target.value);
  };

  const clearAllFilters = () => {
    setFilters({
      search: '',
      asin: '',
      productName: '',
      category: '',
      packSize: '',
      channel: '',
    });
    setStockFilter('ALL_SKUS');
    setDateFilterType('CURRENT_MONTH');
  };

  const hasActiveFilters =
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.packSize ||
    filters.channel ||
    stockFilter !== 'ALL_SKUS' ||
    dateFilterType;

  const hasFiltersToClear =
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.packSize ||
    filters.channel ||
    stockFilter !== 'ALL_SKUS' ||
    dateFilterType !== 'CURRENT_MONTH';

  const kpiTrends = useMemo(() => {
    const fallback = { value: '—', type: 'neutral' };
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      const sign = pct >= 0 ? '+' : '';
      return `${sign}${pct}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    if (!comparison) return { overallBuyboxPct: fallback, noBuyboxSkus: fallback };
    return {
      overallBuyboxPct: { value: fmt(comparison.overallBuyboxPct?.pctChange), type: type(comparison.overallBuyboxPct?.pctChange) },
      noBuyboxSkus: { value: fmt(comparison.noBuyboxSkus?.pctChange), type: type(comparison.noBuyboxSkus?.pctChange) },
    };
  }, [comparison]);

  const actionsRecommended = [
    { action: 'Action 1', recommendation: 'Review pricing for SKUs without Buybox', status: 'No action taken' },
    { action: 'Action 2', recommendation: 'Lower VC price to match Buybox', status: 'Accepted' },
    { action: 'Action 3', recommendation: 'Investigate hijacker sellers', status: 'In progress' },
    { action: 'Action 4', recommendation: 'Increase inventory for high DOS SKUs', status: 'No action required' },
  ];

  if (loading) return <div className="section-muted">Loading...</div>;
  if (error) return <div className="auth-error">{error}</div>;

  const totalRows = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRows = filteredRows.slice(startIndex, endIndex);

  return (
    <>
      <div className="card inventory-filters-card">
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search (ASIN, name, category…)"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <select
              value={filters.asin}
              onChange={(e) => setFilters((f) => ({ ...f, asin: e.target.value }))}
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
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">Product Category</option>
              {categoryOptions.map((cat) => (
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
              value={filters.channel}
              onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
            >
              <option value="">Sales Channel</option>
              {channelOptions.map((ch) => (
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
                onChange={handleDateFilterChange}
                aria-label="Date filter"
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
        <h3>Key Buybox Metrics</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <div className="kpi-item kpi-green">
            <div className="label">Overall Buybox %</div>
            <div className="value value-primary">
              {summary.overallBuyboxPct}%
              <span className={`kpi-trend-inline ${kpiTrends.overallBuyboxPct.type === 'negative' ? 'negative' : kpiTrends.overallBuyboxPct.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.overallBuyboxPct.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div className="kpi-item kpi-amber">
            <div className="label">No. of SKUs with no Buybox</div>
            <div className="value value-primary">
              {summary.noBuyboxSkus}
              <span className={`kpi-trend-inline ${kpiTrends.noBuyboxSkus.type === 'negative' ? 'negative' : kpiTrends.noBuyboxSkus.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.noBuyboxSkus.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
          <div className="kpi-item kpi-blue">
            <div className="label">Actions Recommended</div>
            <div className="value value-primary">48</div>
            <div className="value-secondary">—</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Actions Recommended</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Recommendation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {actionsRecommended.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.action}</td>
                  <td>{row.recommendation}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Detailed Buybox View</h3>
        <div className="filter-row filter-toggle-row">
          {STOCK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn-chip ${stockFilter === f.id ? 'active' : ''}`}
              onClick={() => setStockFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <div className="column-picker-wrap" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn-chip"
              onClick={() => setShowColumnPicker((v) => !v)}
            >
              Other Columns
            </button>
            {showColumnPicker && (
              <div className="column-picker">
                {[
                  { id: 'asin', label: 'ASIN' },
                  { id: 'productName', label: 'Product Name' },
                  { id: 'category', label: 'Product Category' },
                  { id: 'packSize', label: 'Pack Size' },
                  { id: 'channel', label: 'Sales Channel' },
                  { id: 'availableInventory', label: 'Available Inventory' },
                  { id: 'last30DaysSales', label: 'Last 30 Days Sales' },
                  { id: 'dos', label: 'DOS' },
                  { id: 'moq', label: 'MOQ' },
                  { id: 'idealVcPrice', label: 'Ideal VC Price' },
                  { id: 'idealScPrice', label: 'Ideal SC Price' },
                  { id: 'currentBuyboxOwner', label: 'Current Retailer (Owner)' },
                  { id: 'currentBuyboxPrice', label: 'Current Buybox Price' },
                  { id: 'currentVcPrice', label: 'Current VC Price' },
                  { id: 'currentScPrice', label: 'Current SC Price' },
                  { id: 'hijacker1', label: 'Hijacker 1 (Price)' },
                  { id: 'hijacker2', label: 'Hijacker 2 (Price)' },
                  { id: 'hijacker3', label: 'Hijacker 3 (Price)' },
                  { id: 'actionRequired', label: 'Action Required' },
                ].map((col) => (
                  <label key={col.id} className="column-picker-item">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.id]}
                      onChange={() => toggleColumn(col.id)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-chip"
            onClick={() => {}}
          >
            Download Data
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {visibleColumns.asin && <th>ASIN</th>}
                {visibleColumns.productName && <th>Product Name</th>}
                {visibleColumns.category && <th>Product Category</th>}
                {visibleColumns.packSize && <th>Pack Size</th>}
                {visibleColumns.channel && <th>Sales Channel</th>}
                {visibleColumns.availableInventory && <th>Available Inventory</th>}
                {visibleColumns.last30DaysSales && <th>Last 30 Days Sales</th>}
                {visibleColumns.dos && <th>DOS</th>}
                {visibleColumns.moq && <th>MOQ</th>}
                {visibleColumns.idealVcPrice && <th>Ideal VC Price</th>}
                {visibleColumns.idealScPrice && <th>Ideal SC Price</th>}
                {visibleColumns.currentBuyboxOwner && <th>Current Retailer (Owner)</th>}
                {visibleColumns.currentBuyboxPrice && <th>Current Buybox Price</th>}
                {visibleColumns.currentVcPrice && <th>Current VC Price</th>}
                {visibleColumns.currentScPrice && <th>Current SC Price</th>}
                {visibleColumns.hijacker1 && <th>Hijacker 1 (Price)</th>}
                {visibleColumns.hijacker2 && <th>Hijacker 2 (Price)</th>}
                {visibleColumns.hijacker3 && <th>Hijacker 3 (Price)</th>}
                {visibleColumns.actionRequired && <th>Action Required</th>}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id}>
                  {visibleColumns.asin && <td>{row.asin}</td>}
                  {visibleColumns.productName && <td>{row.productName}</td>}
                  {visibleColumns.category && <td>{row.productCategory}</td>}
                  {visibleColumns.packSize && <td>{row.packSize}</td>}
                  {visibleColumns.channel && <td>{row.channel}</td>}
                  {visibleColumns.availableInventory && <td>{row.availableInventory}</td>}
                  {visibleColumns.last30DaysSales && <td>{row.last30DaysSales}</td>}
                  {visibleColumns.dos && <td>{row.dos}</td>}
                  {visibleColumns.moq && <td>{row.moq}</td>}
                  {visibleColumns.idealVcPrice && <td>{row.idealVcPrice}</td>}
                {visibleColumns.idealScPrice && <td>{row.idealScPrice}</td>}
                  {visibleColumns.currentBuyboxOwner && <td>{row.currentBuyboxOwner || '-'}</td>}
                  {visibleColumns.currentBuyboxPrice && <td>{row.currentBuyboxPrice}</td>}
                  {visibleColumns.currentVcPrice && <td>{row.currentVcPrice}</td>}
                  {visibleColumns.currentScPrice && <td>{row.currentScPrice}</td>}
                {visibleColumns.hijacker1 && (
                  <td>
                    {row.hijacker1 ? `${row.hijacker1} - ${row.hijacker1Price ?? '-'}` : '-'}
                  </td>
                )}
                {visibleColumns.hijacker2 && (
                  <td>
                    {row.hijacker2 ? `${row.hijacker2} - ${row.hijacker2Price ?? '-'}` : '-'}
                  </td>
                )}
                {visibleColumns.hijacker3 && (
                  <td>
                    {row.hijacker3 ? `${row.hijacker3} - ${row.hijacker3Price ?? '-'}` : '-'}
                  </td>
                )}
                  {visibleColumns.actionRequired && <td>{row.actionRequired}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={totalRows}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </>
  );
}
