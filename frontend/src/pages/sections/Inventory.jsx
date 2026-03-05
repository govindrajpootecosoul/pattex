import { useEffect, useState } from 'react';
import { dashboardApi } from '../../api/api';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
  { id: 'CUSTOM_RANGE', label: 'Custom Range' },
];

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

function getDateRangeForFilter(dateFilterType, customStart, customEnd) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (!dateFilterType) return null;
  if (dateFilterType === 'CUSTOM_RANGE' && customStart) {
    const start = customEnd && customEnd < customStart ? customEnd : customStart;
    const end = customEnd && customEnd >= customStart ? customEnd : customStart;
    return { start, end };
  }
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
}

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
  const [dateFilterType, setDateFilterType] = useState('');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [isMonthRangeDialogOpen, setIsMonthRangeDialogOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [tempRange, setTempRange] = useState({ start: null, end: null });
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

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const toYearMonth = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const parseYearMonth = (value) => {
    if (!value) return null;
    const [y, m] = value.split('-').map(Number);
    if (!y || !m) return null;
    return new Date(y, m - 1, 1);
  };

  const openMonthRangeDialog = () => {
    const startDate = parseYearMonth(customRangeStart);
    const endDate = parseYearMonth(customRangeEnd);
    const baseYear = startDate ? startDate.getFullYear() : new Date().getFullYear();
    setPickerYear(baseYear);
    setTempRange({
      start: startDate,
      end: endDate && (!startDate || endDate >= startDate) ? endDate : null,
    });
    setIsMonthRangeDialogOpen(true);
  };

  const closeMonthRangeDialog = () => {
    setIsMonthRangeDialogOpen(false);
  };

  const handleMonthClick = (monthIndex) => {
    const clicked = new Date(pickerYear, monthIndex, 1);
    const { start, end } = tempRange;

    if (!start || (start && end)) {
      setTempRange({ start: clicked, end: null });
      return;
    }

    if (start && !end) {
      if (clicked < start) {
        setTempRange({ start: clicked, end: start });
      } else if (clicked.getTime() === start.getTime()) {
        setTempRange({ start, end: null });
      } else {
        setTempRange({ start, end: clicked });
      }
    }
  };

  const confirmMonthRange = () => {
    if (!tempRange.start) {
      closeMonthRangeDialog();
      return;
    }
    const startStr = toYearMonth(tempRange.start);
    const endStr = toYearMonth(tempRange.end || tempRange.start);
    setCustomRangeStart(startStr);
    setCustomRangeEnd(endStr);
    setShowCustomRangePicker(false);
    closeMonthRangeDialog();
  };

  const isMonthInRange = (monthIndex) => {
    const { start, end } = tempRange;
    if (!start) return false;
    const current = new Date(pickerYear, monthIndex, 1);
    if (start && !end) {
      return current.getTime() === start.getTime();
    }
    return current >= start && current <= end;
  };

  const isMonthEdge = (monthIndex) => {
    const { start, end } = tempRange;
    if (!start) return false;
    const current = new Date(pickerYear, monthIndex, 1);
    if (start && !end) {
      return current.getTime() === start.getTime();
    }
    return current.getTime() === start.getTime() || (end && current.getTime() === end.getTime());
  };

  const formatCustomRangeLabel = () => {
    if (!customRangeStart && !customRangeEnd) return 'Select month range';
    const start = parseYearMonth(customRangeStart);
    const end = parseYearMonth(customRangeEnd);
    if (!start && !end) return 'Select month range';
    const startLabel = `${MONTH_LABELS[start.getMonth()]} ${start.getFullYear()}`;
    if (!end || end.getTime() === start.getTime()) {
      return startLabel;
    }
    const endLabel = `${MONTH_LABELS[end.getMonth()]} ${end.getFullYear()}`;
    return `${startLabel} – ${endLabel}`;
  };

  useEffect(() => {
    dashboardApi
      .getInventory()
      .then((data) => {
        const apiRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(apiRows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
  const channelOptions = Array.from(new Set(rows.map((r) => r.channel).filter(Boolean)));

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
    if (filters.channel && row.channel !== filters.channel) return false;
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

  const dateRange = getDateRangeForFilter(dateFilterType, customRangeStart, customRangeEnd);

  const applyDateFilter = (row) => {
    if (!dateRange || !row.reportMonth) return true;
    return row.reportMonth >= dateRange.start && row.reportMonth <= dateRange.end;
  };

  const clearAllFilters = () => {
    setDateFilterType('');
    setCustomRangeStart('');
    setCustomRangeEnd('');
    setShowCustomRangePicker(false);
    setFilters({ search: '', asin: '', productName: '', category: '', channel: '' });
    setStockFilter('ALL_SKUS');
  };

  const hasActiveFilters =
    dateFilterType ||
    customRangeStart ||
    customRangeEnd ||
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.channel !== '' ||
    stockFilter !== 'ALL_SKUS';

  const handleDateFilterChange = (e) => {
    const value = e.target.value;
    setDateFilterType(value);
    if (value === 'CUSTOM_RANGE') {
      setShowCustomRangePicker(true);
      openMonthRangeDialog();
    } else {
      setShowCustomRangePicker(false);
      setCustomRangeStart('');
      setCustomRangeEnd('');
    }
  };

  const filteredRows = rows.filter(
    (row) => applyFilters(row) && applyStockFilter(row) && applyDateFilter(row),
  );
  const summary = computeSummary(filteredRows);

  // Dynamic week-over-week (WoW) trends based on actual dates
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
                        <td>{row.last30DaysSales}</td>
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

  return (
    <>
      <h2 className="section-title">Pattex Inventory Dashboard</h2>

      <div className="card inventory-filters-card">
        <h3>Filters</h3>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search ASIN, name, category, channel…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              aria-label="Search"
            />
          </div>
          <div className="filter-group">
            <label>ASIN</label>
            <select
              value={filters.asin}
              onChange={handleAsinChange}
            >
              <option value="">All</option>
              {asinOptions.map((asin) => (
                <option key={asin} value={asin}>
                  {asin}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Product Name</label>
            <select
              value={filters.productName}
              onChange={handleProductNameChange}
            >
              <option value="">All</option>
              {productNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Product Category</label>
            <select
              value={filters.category}
              onChange={handleCategoryChange}
            >
              <option value="">All</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Sales Channel</label>
            <select
              value={filters.channel}
              onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
            >
              <option value="">All</option>
              {channelOptions.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Date</label>
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
          </div>
          {showCustomRangePicker && dateFilterType === 'CUSTOM_RANGE' && (
            <div className="filter-group">
              <label>Period</label>
              <button
                type="button"
                className="btn-month-range"
                onClick={openMonthRangeDialog}
              >
                {formatCustomRangeLabel()}
              </button>
            </div>
          )}
          {hasActiveFilters && (
            <div className="filter-group filter-group-actions">
              <label>&nbsp;</label>
              <button
                type="button"
                className="btn-clear-filter"
                onClick={clearAllFilters}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Key Inventory Metrics</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-green"
            onClick={() => openMetricModal(METRIC_IDS.AVAILABLE)}
          >
            <div className="label">Available Inventory</div>
            <div className="value">{summary.totalAvailable.toLocaleString()}</div>
            <div className={`kpi-trend ${metricTrends.available.type === 'negative' ? 'negative' : metricTrends.available.type === 'neutral' ? 'neutral' : ''}`}>
              {metricTrends.available.value} from last week
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.LAST_30_SALES)}
          >
            <div className="label">Last 30 Days Sales</div>
            <div className="value">{summary.last30Sales.toLocaleString()}</div>
            <div className={`kpi-trend ${metricTrends.last30Sales.type === 'negative' ? 'negative' : metricTrends.last30Sales.type === 'neutral' ? 'neutral' : ''}`}>
              {metricTrends.last30Sales.value} from last week
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-amber"
            onClick={() => openMetricModal(METRIC_IDS.DOS)}
          >
            <div className="label">Avg. Days of Supply</div>
            <div className="value">{summary.avgDos}</div>
            <div className={`kpi-trend ${metricTrends.dos.type === 'negative' ? 'negative' : metricTrends.dos.type === 'neutral' ? 'neutral' : ''}`}>
              {metricTrends.dos.value} from last week
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-violet"
            onClick={() => openMetricModal(METRIC_IDS.INSTOCK_RATE)}
          >
            <div className="label">Instock Rate</div>
            <div className="value">{summary.instockRate}%</div>
            <div className={`kpi-trend ${metricTrends.instockRate.type === 'negative' ? 'negative' : metricTrends.instockRate.type === 'neutral' ? 'neutral' : ''}`}>
              {metricTrends.instockRate.value} from last week
            </div>
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
              {filteredRows.map((row) => (
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
                  {visibleColumns.sales30 && <td className="col-num">{row.last30DaysSales}</td>}
                  {visibleColumns.dos && <td className="col-num">{row.dos}</td>}
                  {visibleColumns.instockRate && <td className="col-num">{row.instockRate}%</td>}
                  {visibleColumns.openPos && <td className="col-num">{row.openPos}</td>}
                  {visibleColumns.oosDate && <td>{row.oosDate}</td>}
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
      </div>

      {renderMetricModal()}
      {isMonthRangeDialogOpen && (
        <div className="modal-backdrop" onClick={closeMonthRangeDialog}>
          <div className="modal month-range-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Month Range</h3>
            </div>
            <div className="month-range-header">
              <button
                type="button"
                className="month-range-nav"
                onClick={() => setPickerYear((y) => y - 1)}
              >
                ‹
              </button>
              <div className="month-range-year">{pickerYear}</div>
              <button
                type="button"
                className="month-range-nav"
                onClick={() => setPickerYear((y) => y + 1)}
              >
                ›
              </button>
            </div>
            <div className="month-grid">
              {MONTH_LABELS.map((label, index) => {
                const inRange = isMonthInRange(index);
                const isEdge = isMonthEdge(index);
                return (
                  <button
                    key={label}
                    type="button"
                    className={`month-cell ${inRange ? 'in-range' : ''} ${isEdge ? 'edge' : ''}`}
                    onClick={() => handleMonthClick(index)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="month-range-actions">
              <button
                type="button"
                className="btn-text"
                onClick={closeMonthRangeDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={confirmMonthRange}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
