import { useEffect, useState, useMemo } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';
import { formatDateDDMonYY } from '../../utils/dateFormat';

const STOCK_FILTERS = [
  { id: 'ALL_SKUS', label: 'All SKUs' },
  { id: 'LOW_STOCK', label: 'Low Stock' },
  { id: 'LOW_STOCK_OPEN_PO', label: 'No/Low Stock w/ Open POs' },
  { id: 'LOW_STOCK_NO_OPEN_PO', label: 'No/Low Stock w/ no Open POs' },
];

const METRIC_IDS = {
  AVAILABLE: 'AVAILABLE',
  LAST_30_SALES: 'LAST_30_SALES',
  DOS: 'DOS',
  INSTOCK_RATE: 'INSTOCK_RATE',
};

function getStatusBadgeClass(status) {
  if (!status) return 'badge-instock';
  const s = String(status).toLowerCase();
  if (s === 'oos' || s === 'out of stock' || s === 'out') return 'badge-oos badge-out';
  if (s === 'critical' || s === 'low' || s === 'low stock') return 'badge-low badge-critical';
  return 'badge-instock badge-active';
}

const computeSummary = (rows) => {
  if (!rows.length) {
    return { totalAvailable: 0, last30Sales: 0, avgDos: 0, instockRate: 0 };
  }
  const totalAvailable = rows.reduce((sum, r) => sum + (Number(r.available) || 0), 0);
  const last30Sales = rows.reduce((sum, r) => sum + (Number(r.last30DaysSales) || 0), 0);
  const avgDos =
    rows.length > 0
      ? Math.round(rows.reduce((sum, r) => sum + (Number(r.dos) || 0), 0) / rows.length)
      : 0;
  const instockRate =
    rows.length > 0
      ? Math.round(
          rows.reduce((sum, r) => sum + (Number(r.instockRate) || 0), 0) / rows.length,
        )
      : 0;

  return { totalAvailable, last30Sales, avgDos, instockRate };
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const normalizeDateKey = (value) => {
  if (!value) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
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
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
};

export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    channel: '',
  });
  const [stockFilter, setStockFilter] = useState('ALL_SKUS');
  const [metricModal, setMetricModal] = useState(null);
  const [todayStr] = useState(() => new Date().toISOString().split('T')[0]);
  const [maxSelectableDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  });
  const [comparison, setComparison] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState({
    asin: true,
    productName: true,
    category: true,
    packSize: true,
    channel: true,
    available: true,
    sales30: true,
    dos: true,
    instockRate: true,
    openPos: true,
    oosDate: true,
    status: true,
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (selectedDate) {
      params.customRangeStart = selectedDate;
      params.customRangeEnd = selectedDate;
    }
    dashboardApi
      .getInventory(params)
      .then((data) => {
        const apiRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(apiRows);
        setComparison(data?.comparison ?? null);
        setUpdatedAt(data?.updatedAt ?? null);
      })
      .catch((e) => {
        setError(e.message);
        setComparison(null);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // Cascading options: Category -> Product Name -> ASIN
  const categoryOptions = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));

  const rowsForProductNames = filters.category
    ? rows.filter((r) => r.category === filters.category)
    : rows;
  const productNameOptions = Array.from(
    new Set(rowsForProductNames.map((r) => r.productName).filter(Boolean)),
  );

  const rowsForAsins =
    filters.productName
      ? rowsForProductNames.filter((r) => r.productName === filters.productName)
      : rowsForProductNames;
  const asinOptions = Array.from(new Set(rowsForAsins.map((r) => r.asin).filter(Boolean)));
  const channelOptions = Array.from(new Set(rows.map((r) => r.channel || r.salesChannel).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));

  const applyFilters = (row) => {
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      if (!q) return true;
      const searchable = [
        row.asin,
        row.productName,
        row.category,
        row.channel,
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      if (!searchable.some((s) => s.includes(q))) return false;
    }
    if (filters.asin && row.asin !== filters.asin) return false;
    if (filters.productName && row.productName !== filters.productName) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.channel && (row.channel || row.salesChannel) !== filters.channel) return false;
    return true;
  };

  const applyStockFilter = (row) => {
    switch (stockFilter) {
      case 'LOW_STOCK':
        // Low Stock button should show rows where Stock_Status === 'Understock'
        return row.status === 'Understock';
      case 'LOW_STOCK_OPEN_PO':
        // No/Low Stock w/ Open POs: show when corresponding column equals 1
        return row.noLowStockWithOpenPos === 1;
      case 'LOW_STOCK_NO_OPEN_PO':
        // No/Low Stock w/ no Open POs: show when corresponding column equals 1
        return row.noLowStockNoOpenPos === 1;
      default:
        return true;
    }
  };

  const applyDateFilter = (row) => {
    if (!selectedDate) return true;
    const rowDate = row.reportDate || normalizeDateKey(row.oosDate);
    if (!rowDate) return false;
    return rowDate === selectedDate;
  };

  const clearAllFilters = () => {
    setSelectedDate(maxSelectableDateStr);
    setFilters({ search: '', asin: '', productName: '', category: '', channel: '' });
    setStockFilter('ALL_SKUS');
  };

  const hasFiltersToClear =
    selectedDate !== maxSelectableDateStr ||
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.channel !== '' ||
    stockFilter !== 'ALL_SKUS';

  const filteredRowsNoDate = useMemo(
    () => rows.filter((row) => applyFilters(row) && applyStockFilter(row)),
    [rows, filters, stockFilter],
  );

  const filteredRows = useMemo(
    () => filteredRowsNoDate.filter((row) => applyDateFilter(row)),
    [filteredRowsNoDate, selectedDate],
  );

  const summary = computeSummary(filteredRows);

  // Last 30 days window (based on selectedDate) for total_sales aggregation
  const rowsInLast30Days = useMemo(() => {
    if (!selectedDate) return filteredRowsNoDate;
    const end = new Date(selectedDate);
    if (Number.isNaN(end.getTime())) return filteredRowsNoDate;
    const start = new Date(end);
    start.setDate(start.getDate() - 29); // inclusive 30-day window

    return filteredRowsNoDate.filter((row) => {
      const key = row.reportDate || normalizeDateKey(row.oosDate);
      if (!key) return false;
      const d = new Date(key);
      if (Number.isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    });
  }, [filteredRowsNoDate, selectedDate]);

  const summaryLast30 = useMemo(() => computeSummary(rowsInLast30Days), [rowsInLast30Days]);

  const last30SalesByAsin = useMemo(() => {
    const map = {};
    rowsInLast30Days.forEach((row) => {
      const asin = row.asin;
      if (!asin) return;
      const sales = Number(row.last30DaysSales) || 0;
      map[asin] = (map[asin] || 0) + sales;
    });
    return map;
  }, [rowsInLast30Days]);

  const kpiTrends = useMemo(() => {
    const fallback = { value: '—', type: 'neutral' };
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      if (pct >= 0) return `↑${pct}%`;
      return `↓${Math.abs(pct)}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    if (!comparison) {
      return { available: fallback, last30Sales: fallback, dos: fallback, instockRate: fallback };
    }
    return {
      available: { value: fmt(comparison.available?.pctChange), type: type(comparison.available?.pctChange) },
      last30Sales: { value: fmt(comparison.last30Sales?.pctChange), type: type(comparison.last30Sales?.pctChange) },
      dos: { value: fmt(comparison.dos?.pctChange), type: type(comparison.dos?.pctChange) },
      instockRate: { value: fmt(comparison.instockRate?.pctChange), type: type(comparison.instockRate?.pctChange) },
    };
  }, [comparison]);

  // Dynamic week-over-week (WoW) trends based on actual dates (kept for any secondary use; cards use kpiTrends from API)
  const rowsForTrend = filteredRows.filter(
    (r) => r.oosDate && !Number.isNaN(new Date(r.oosDate).getTime()),
  );

  // When we really cannot compute WoW (no valid dates), treat as "New" instead of 0%
  const defaultTrend = { value: 'New', type: 'positive' };
  let metricTrends = {
    available: defaultTrend,
    last30Sales: defaultTrend,
    dos: defaultTrend,
    instockRate: defaultTrend,
  };

  if (rowsForTrend.length > 0) {
    const parsed = rowsForTrend
      .map((r) => ({ row: r, date: new Date(r.oosDate) }))
      .filter(({ date }) => !Number.isNaN(date.getTime()));

    if (parsed.length > 0) {
      const maxDate = new Date(
        Math.max.apply(
          null,
          parsed.map(({ date }) => date.getTime()),
        ),
      );

      const startOfCurrent = new Date(maxDate);
      startOfCurrent.setDate(startOfCurrent.getDate() - 6);

      const endOfPrev = new Date(startOfCurrent);
      endOfPrev.setDate(endOfPrev.getDate() - 1);

      const startOfPrev = new Date(endOfPrev);
      startOfPrev.setDate(startOfPrev.getDate() - 6);

      const inRange = (d, start, end) => d >= start && d <= end;

      const currentRows = parsed
        .filter(({ date }) => inRange(date, startOfCurrent, maxDate))
        .map(({ row }) => row);
      const previousRows = parsed
        .filter(({ date }) => inRange(date, startOfPrev, endOfPrev))
        .map(({ row }) => row);

      const currentSummary = computeSummary(currentRows);
      const previousSummary = computeSummary(previousRows);

      const makeWowTrend = (current, previous) => {
        // If there is no previous data or it sums to 0, treat as "new"
        if (!previous || previous === 0 || !Number.isFinite(previous)) {
          return { value: 'New', type: 'positive' };
        }
        const diff = current - previous;
        const pct = (diff / Math.abs(previous)) * 100;
        if (!Number.isFinite(pct)) return defaultTrend;
        const rounded = Math.round(pct);
        const sign = rounded > 0 ? '+' : '';
        let type = 'neutral';
        if (rounded > 0) type = 'positive';
        else if (rounded < 0) type = 'negative';
        return { value: `${sign}${rounded}%`, type };
      };

      metricTrends = {
        available: makeWowTrend(currentSummary.totalAvailable, previousSummary.totalAvailable),
        last30Sales: makeWowTrend(currentSummary.last30Sales, previousSummary.last30Sales),
        dos: makeWowTrend(currentSummary.avgDos, previousSummary.avgDos),
        instockRate: makeWowTrend(currentSummary.instockRate, previousSummary.instockRate),
      };
    }
  }

  // Cascading filter handlers
  const handleCategoryChange = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      category: value,
      // Reset children whenever parent changes
      productName: '',
      asin: '',
    }));
  };

  const handleProductNameChange = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      productName: value,
      // Reset child when parent (product name) changes
      asin: '',
    }));
  };

  const handleAsinChange = (e) => {
    const value = e.target.value;
    if (!value) {
      // When ASIN is cleared manually, keep parent selections
      setFilters((prev) => ({ ...prev, asin: '' }));
      return;
    }

    // Reverse auto-population: infer product + category from ASIN
    const match = rows.find((r) => r.asin === value);
    setFilters((prev) => ({
      ...prev,
      asin: value,
      productName: match?.productName || prev.productName,
      category: match?.category || prev.category,
    }));
  };

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openMetricModal = (metricId) => {
    setMetricModal(metricId);
  };

  const closeMetricModal = () => {
    setMetricModal(null);
  };

  const renderMetricModal = () => {
    if (!metricModal) return null;

    let title = '';
    let columns = [];

    switch (metricModal) {
      case METRIC_IDS.AVAILABLE:
        title = 'Available Inventory – SKU Breakdown';
        columns = ['ASIN', 'Product Name', 'Sales Channel', 'Available'];
        break;
      case METRIC_IDS.LAST_30_SALES:
        title = 'Last 30 Days Sales – SKU Breakdown';
        columns = ['ASIN', 'Product Name', 'Sales Channel', 'Last 30 Days Sales'];
        break;
      case METRIC_IDS.DOS:
        title = 'Average Days of Supply – SKU Breakdown';
        columns = ['ASIN', 'Product Name', 'Sales Channel', 'Days of Supply'];
        break;
      case METRIC_IDS.INSTOCK_RATE:
        title = 'Instock Rate – SKU Breakdown';
        columns = ['ASIN', 'Product Name', 'Sales Channel', 'Instock Rate %', 'Status'];
        break;
      default:
        return null;
    }

    return (
      <div className="modal-backdrop" onClick={closeMetricModal}>
        <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{title}</h3>
            <button type="button" className="btn-logout" onClick={closeMetricModal}>
              Close
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    {metricModal === METRIC_IDS.AVAILABLE && (
                      <>
                        <td>{row.asin}</td>
                        <td>{row.productName}</td>
                        <td>{row.channel}</td>
                        <td>{row.available}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.LAST_30_SALES && (
                      <>
                        <td>{row.asin}</td>
                        <td>{row.productName}</td>
                        <td>{row.channel}</td>
                        <td>AED {Math.round(Number(row.last30DaysSales) || 0).toLocaleString()}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.DOS && (
                      <>
                        <td>{row.asin}</td>
                        <td>{row.productName}</td>
                        <td>{row.channel}</td>
                        <td>{row.dos}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.INSTOCK_RATE && (
                      <>
                        <td>{row.asin}</td>
                        <td>{row.productName}</td>
                        <td>{row.channel}</td>
                        <td>{row.instockRate}%</td>
                        <td>{row.status}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="section-muted">Loading...</div>;
  if (error) return <div className="auth-error">{error}</div>;

  const totalRows = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRows = filteredRows.slice(startIndex, endIndex);

  const dataUpdatedDate = updatedAt ? formatDateDDMonYY(String(updatedAt).split('T')[0]) : null;

  return (
    <>
      <div className="card inventory-filters-card">
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search (ASIN, name, category, channel…)"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              aria-label="Search"
            />
          </div>
          <div className="filter-group">
            <select
              value={filters.asin}
              onChange={handleAsinChange}
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
              onChange={handleProductNameChange}
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
              onChange={handleCategoryChange}
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
              <input
                type="date"
                value={selectedDate}
                max={maxSelectableDateStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Inventory date"
              />
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
          <h3 className="exec-kpi-title">Key Inventory Metrics</h3>
          {dataUpdatedDate && (
            <span className="exec-updated-text">
              <span className="pulse-dot" />
              Data updated as of <strong>{dataUpdatedDate}</strong>
            </span>
          )}
        </div>
        <div className="kpi-grid revenue-kpi-grid">
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-green"
            onClick={() => openMetricModal(METRIC_IDS.AVAILABLE)}
          >
            <div className="label">Available Inventory</div>
            <div className="value value-primary">
              {summary.totalAvailable.toLocaleString()}
              <span className={`kpi-trend-inline ${kpiTrends.available.type === 'negative' ? 'negative' : kpiTrends.available.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.available.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.LAST_30_SALES)}
          >
            <div className="label">Last 30 Days Sales</div>
            <div className="value value-primary">
              AED {Math.round(summaryLast30.last30Sales).toLocaleString()}
              <span className={`kpi-trend-inline ${kpiTrends.last30Sales.type === 'negative' ? 'negative' : kpiTrends.last30Sales.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.last30Sales.value})
              </span>
            </div>
            <div className="value-secondary">vs last period (AED)</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-amber"
            onClick={() => openMetricModal(METRIC_IDS.DOS)}
          >
            <div className="label">Avg. Days of Supply</div>
            <div className="value value-primary">
              {summary.avgDos}
              <span className={`kpi-trend-inline ${kpiTrends.dos.type === 'negative' ? 'negative' : kpiTrends.dos.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.dos.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-violet"
            onClick={() => openMetricModal(METRIC_IDS.INSTOCK_RATE)}
          >
            <div className="label">Instock Rate</div>
            <div className="value value-primary">
              {summary.instockRate}%
              <span className={`kpi-trend-inline ${kpiTrends.instockRate.type === 'negative' ? 'negative' : kpiTrends.instockRate.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.instockRate.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Detailed Inventory Report</h3>
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
          <div className="column-picker-wrap">
            <button
              type="button"
              className="btn-chip"
              onClick={() => setShowColumnPicker((v) => !v)}
            >
              Columns
            </button>
            {showColumnPicker && (
              <div className="column-picker">
                {[
                  { id: 'asin', label: 'ASIN' },
                  { id: 'productName', label: 'Product Name' },
                  { id: 'category', label: 'Category' },
                  { id: 'packSize', label: 'Pack Size' },
                  { id: 'channel', label: 'Sales Channel' },
                  { id: 'available', label: 'Available' },
                  { id: 'sales30', label: '30D Sales' },
                  { id: 'dos', label: 'DOS' },
                  { id: 'instockRate', label: 'Instock Rate' },
                  { id: 'openPos', label: 'Open POs' },
                  { id: 'oosDate', label: 'OOS Date' },
                  { id: 'status', label: 'Status' },
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
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {visibleColumns.asin && <th>ASIN</th>}
                {visibleColumns.productName && <th>Product Name</th>}
                {visibleColumns.category && <th>Category</th>}
                {visibleColumns.packSize && <th>Pack Size</th>}
                {visibleColumns.channel && <th>Sales Channel</th>}
                {visibleColumns.available && <th className="col-num">Available</th>}
                {visibleColumns.sales30 && <th className="col-num">30D Sales</th>}
                {visibleColumns.dos && <th className="col-num">DOS</th>}
                {visibleColumns.instockRate && <th className="col-num">Instock Rate</th>}
                {visibleColumns.openPos && <th className="col-num">Open POs</th>}
                {visibleColumns.oosDate && <th>OOS Date</th>}
                {visibleColumns.status && <th>Status</th>}
                <th className="cell-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id}>
                  {visibleColumns.asin && <td><span className="text-secondary">{row.asin}</span></td>}
                  {visibleColumns.productName && (
                    <td>
                      <div className="cell-product">
                        <div className="table-thumb" aria-hidden>—</div>
                        <div>
                          <div>{row.productName}</div>
                          {!visibleColumns.asin && row.asin && <div className="text-secondary">{row.asin}</div>}
                        </div>
                      </div>
                    </td>
                  )}
                  {visibleColumns.category && <td>{row.category}</td>}
                  {visibleColumns.packSize && <td>{row.packSize}</td>}
                  {visibleColumns.channel && <td>{row.channel}</td>}
                  {visibleColumns.available && <td className="col-num">{row.available}</td>}
                  {visibleColumns.sales30 && (
                    <td className="col-num">
                      AED {Math.round(
                        last30SalesByAsin[row.asin] != null
                          ? last30SalesByAsin[row.asin]
                          : Number(row.last30DaysSales) || 0,
                      ).toLocaleString()}
                    </td>
                  )}
                  {visibleColumns.dos && <td className="col-num">{row.dos}</td>}
                  {visibleColumns.instockRate && <td className="col-num">{row.instockRate}%</td>}
                  {visibleColumns.openPos && <td className="col-num">{row.openPos}</td>}
                  {visibleColumns.oosDate && <td>{row.oosDate ? formatDateDDMonYY(row.oosDate) : row.oosDate}</td>}
                  {visibleColumns.status && (
                    <td>
                      <span className={`badge ${getStatusBadgeClass(row.status)}`}>
                        {row.status || 'Active'}
                      </span>
                    </td>
                  )}
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn-quick-actions"
                      onClick={() => {}}
                      aria-label="Quick actions"
                      title="Quick actions"
                    >
                      ⋮
                    </button>
                  </td>
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

      {renderMetricModal()}
    </>
  );
}
