import { useState, useMemo, useEffect } from 'react';
import { dashboardApi } from '../../api/api';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
  { id: 'CUSTOM_RANGE', label: 'Custom Range' },
];

const METRIC_IDS = {
  OVERALL: 'OVERALL',
  AD: 'AD',
  ORGANIC: 'ORGANIC',
  NEW_TO_BRAND: 'NEW_TO_BRAND',
  PROMO: 'PROMO',
  AOV: 'AOV',
  TACOS: 'TACOS',
};

/* Dummy trend indicators for KPI cards */
const KPI_TRENDS = {
  overall: { value: '+5%', type: 'positive' },
  ad: { value: '+3%', type: 'positive' },
  organic: { value: '-1%', type: 'negative' },
  newToBrand: { value: '+8%', type: 'positive' },
  promo: { value: '0%', type: 'neutral' },
  aov: { value: '+2%', type: 'positive' },
  tacos: { value: '-0.5%', type: 'negative' },
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getDateRangeForFilter = (dateFilterType, customStart, customEnd) => {
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
};

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

export default function Revenue() {
  const [revenueRows, setRevenueRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    channel: '',
  });
  const [dateFilterType, setDateFilterType] = useState('');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [isMonthRangeDialogOpen, setIsMonthRangeDialogOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [tempRange, setTempRange] = useState({ start: null, end: null });
  const [metricModal, setMetricModal] = useState(null);
  const [detailedView, setDetailedView] = useState('all'); // 'all' | 'best_units' | 'worst_units' | 'best_revenue' | 'worst_revenue'

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    dashboardApi
      .getRevenue()
      .then((data) => {
        if (!cancelled && data?.rows) setRevenueRows(data.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load revenue data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Cascading options: Category -> Product Name -> ASIN
  const categoryOptions = useMemo(
    () => Array.from(new Set(revenueRows.map((r) => r.productCategory).filter(Boolean))),
    [revenueRows],
  );

  const rowsForProductNames = useMemo(
    () => (filters.category
      ? revenueRows.filter((r) => r.productCategory === filters.category)
      : revenueRows),
    [revenueRows, filters.category],
  );
  const productNameOptions = useMemo(
    () => Array.from(new Set(rowsForProductNames.map((r) => r.productName).filter(Boolean))),
    [rowsForProductNames],
  );

  const rowsForAsins = useMemo(
    () => (filters.productName
      ? rowsForProductNames.filter((r) => r.productName === filters.productName)
      : rowsForProductNames),
    [rowsForProductNames, filters.productName],
  );
  const asinOptions = useMemo(
    () => Array.from(new Set(rowsForAsins.map((r) => r.asin).filter(Boolean))),
    [rowsForAsins],
  );
  const channelOptions = useMemo(
    () => ['Overall', ...Array.from(new Set(revenueRows.map((r) => r.salesChannel).filter(Boolean)))],
    [revenueRows],
  );

  const applyFilters = (row) => {
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      if (q) {
        const searchable = [
          row.asin,
          row.productName,
          row.productCategory,
          row.salesChannel,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
        if (!searchable.some((s) => s.includes(q))) return false;
      }
    }
    if (filters.asin && row.asin !== filters.asin) return false;
    if (filters.productName && row.productName !== filters.productName) return false;
    if (filters.category && row.productCategory !== filters.category) return false;
    if (filters.channel && filters.channel !== 'Overall' && row.salesChannel !== filters.channel) return false;
    const dateRange = getDateRangeForFilter(dateFilterType, customRangeStart, customRangeEnd);
    if (!dateRange || !row.reportMonth) return true;
    return row.reportMonth >= dateRange.start && row.reportMonth <= dateRange.end;
  };

  const filteredRows = revenueRows.filter(applyFilters);

  const tableRows = useMemo(() => {
    if (detailedView === 'all') return filteredRows;
    let base = [...filteredRows];
    if (detailedView === 'best_units') {
      base.sort((a, b) => (b.overallUnit ?? 0) - (a.overallUnit ?? 0));
      return base.slice(0, 10);
    }
    if (detailedView === 'worst_units') {
      // Exclude rows with 0 units when looking for worst performers
      base = base.filter((r) => (r.overallUnit ?? 0) > 0);
      base.sort((a, b) => (a.overallUnit ?? 0) - (b.overallUnit ?? 0));
      return base.slice(0, 10);
    }
    if (detailedView === 'best_revenue') {
      base.sort((a, b) => (b.overallRevenue ?? 0) - (a.overallRevenue ?? 0));
      return base.slice(0, 10);
    }
    if (detailedView === 'worst_revenue') {
      // Exclude rows with 0 revenue when looking for worst performers
      base = base.filter((r) => (r.overallRevenue ?? 0) > 0);
      base.sort((a, b) => (a.overallRevenue ?? 0) - (b.overallRevenue ?? 0));
      return base.slice(0, 10);
    }
    return filteredRows;
  }, [filteredRows, detailedView]);

  const summary = useMemo(() => {
    if (!filteredRows.length) {
      return {
        overallUnit: 0,
        overallRevenue: 0,
        adRevenue: 0,
        organicRevenue: 0,
        newToBrandUnit: 0,
        promoRevenue: 0,
        aov: 0,
        tacos: 0,
      };
    }
    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.overallUnit += Number(r.overallUnit) || 0;
        acc.overallRevenue += Number(r.overallRevenue) || 0;
        acc.adRevenue += Number(r.adRevenue) || 0;
        acc.organicRevenue += Number(r.organicRevenue) || 0;
        acc.newToBrandUnit += Number(r.newToBrandUnit) || 0;
        acc.promoRevenue += (Number(r.promotionalUnit) || 0) * (Number(r.aov) || 0);
        acc.aov += Number(r.aov) || 0;
        acc.tacos += Number(r.tacos) || 0;
        return acc;
      },
      {
        overallUnit: 0,
        overallRevenue: 0,
        adRevenue: 0,
        organicRevenue: 0,
        newToBrandUnit: 0,
        promoRevenue: 0,
        aov: 0,
        tacos: 0,
      },
    );
    const count = filteredRows.length;
    return {
      ...totals,
      aov: totals.aov / count,
      tacos: totals.tacos / count,
    };
  }, [filteredRows]);

  const clearAllFilters = () => {
    setFilters({ search: '', asin: '', productName: '', category: '', channel: '' });
    setDateFilterType('');
    setCustomRangeStart('');
    setCustomRangeEnd('');
    setShowCustomRangePicker(false);
  };

  const hasActiveFilters =
    dateFilterType ||
    customRangeStart ||
    customRangeEnd ||
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.channel !== '';

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
      case METRIC_IDS.OVERALL:
        title = 'Overall Unit / Revenue – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'Units', 'Revenue'];
        break;
      case METRIC_IDS.AD:
        title = 'Ad Unit / Revenue – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'Ad Units', 'Ad Revenue'];
        break;
      case METRIC_IDS.ORGANIC:
        title = 'Organic Unit / Revenue – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'Organic Units', 'Organic Revenue'];
        break;
      case METRIC_IDS.NEW_TO_BRAND:
        title = 'New to Brand Units – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'New to Brand Units'];
        break;
      case METRIC_IDS.PROMO:
        title = 'Promotional Units – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'Promotional Units'];
        break;
      case METRIC_IDS.AOV:
        title = 'Average Order Value – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'AOV'];
        break;
      case METRIC_IDS.TACOS:
        title = 'TACoS – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'TACoS %'];
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
                    {metricModal === METRIC_IDS.OVERALL && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{Number(row.overallUnit) || 0}</td>
                        <td>{(Number(row.overallRevenue) || 0).toLocaleString()}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.AD && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{Number(row.adUnit) || 0}</td>
                        <td>{(Number(row.adRevenue) || 0).toLocaleString()}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.ORGANIC && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{Number(row.organicUnit) || 0}</td>
                        <td>{(Number(row.organicRevenue) || 0).toLocaleString()}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.NEW_TO_BRAND && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{Number(row.newToBrandUnit) || 0}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.PROMO && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{Number(row.promotionalUnit) || 0}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.AOV && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{(Number(row.aov) || 0).toFixed(2)}</td>
                      </>
                    )}
                    {metricModal === METRIC_IDS.TACOS && (
                      <>
                        <td>{row.asin ?? '—'}</td>
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td>{(Number(row.tacos) || 0).toFixed(1)}%</td>
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
    const match = revenueRows.find((r) => r.asin === value);
    setFilters((prev) => ({
      ...prev,
      asin: value,
      productName: match?.productName || prev.productName,
      category: match?.productCategory || prev.category,
    }));
  };

  if (loading) {
    return (
      <>
        <h2 className="section-title">Pattex Revenue Dashboard</h2>
        <div className="card">
          <p className="section-muted">Loading revenue data...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h2 className="section-title">Pattex Revenue Dashboard</h2>
        <div className="card">
          <p className="section-muted" style={{ color: 'var(--color-error, #c00)' }}>{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="section-title">Pattex Revenue Dashboard</h2>

      <div className="card revenue-filters-card">
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
        <h3>Key Revenue Metrics</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.OVERALL)}
          >
            <div className="label">Overall Unit / Revenue</div>
            <div className="value">
              {summary.overallUnit.toLocaleString()} units
            </div>
            <div className="section-muted text-secondary" style={{ marginTop: 2 }}>
              Revenue AED {summary.overallRevenue.toLocaleString()}
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.overall.type === 'negative' ? 'negative' : KPI_TRENDS.overall.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.overall.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-violet"
            onClick={() => openMetricModal(METRIC_IDS.AD)}
          >
            <div className="label">Ad Unit / Revenue</div>
            <div className="value">
              AED {summary.adRevenue.toLocaleString()}
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.ad.type === 'negative' ? 'negative' : KPI_TRENDS.ad.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.ad.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-green"
            onClick={() => openMetricModal(METRIC_IDS.ORGANIC)}
          >
            <div className="label">Organic Unit / Revenue</div>
            <div className="value">
              AED {summary.organicRevenue.toLocaleString()}
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.organic.type === 'negative' ? 'negative' : KPI_TRENDS.organic.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.organic.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-amber"
            onClick={() => openMetricModal(METRIC_IDS.NEW_TO_BRAND)}
          >
            <div className="label">New to Brand Units</div>
            <div className="value">
              {summary.newToBrandUnit.toLocaleString()} units
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.newToBrand.type === 'negative' ? 'negative' : KPI_TRENDS.newToBrand.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.newToBrand.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-rose"
            onClick={() => openMetricModal(METRIC_IDS.PROMO)}
          >
            <div className="label">Promotional Units</div>
            <div className="value">
              AED {summary.promoRevenue.toLocaleString()}
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.promo.type === 'negative' ? 'negative' : KPI_TRENDS.promo.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.promo.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-slate"
            onClick={() => openMetricModal(METRIC_IDS.AOV)}
          >
            <div className="label">Average Order Value (AOV)</div>
            <div className="value">
              AED {summary.aov.toFixed(2)}
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.aov.type === 'negative' ? 'negative' : KPI_TRENDS.aov.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.aov.value} from last period
            </div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.TACOS)}
          >
            <div className="label">TACoS</div>
            <div className="value">
              {summary.tacos.toFixed(1)}%
            </div>
            <div className={`kpi-trend ${KPI_TRENDS.tacos.type === 'negative' ? 'negative' : KPI_TRENDS.tacos.type === 'neutral' ? 'neutral' : ''}`}>
              {KPI_TRENDS.tacos.value} from last period
            </div>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Detailed Revenue View</h3>
        <div className="filter-row filter-toggle-row">
          <button
            type="button"
            className={`btn-chip ${detailedView === 'all' ? 'active' : ''}`}
            onClick={() => setDetailedView('all')}
          >
            All SKUs
          </button>
          <button
            type="button"
            className={`btn-chip ${detailedView === 'best_units' ? 'active' : ''}`}
            onClick={() => setDetailedView('best_units')}
          >
            Top 10 Best Performers – Units
          </button>
          <button
            type="button"
            className={`btn-chip ${detailedView === 'worst_units' ? 'active' : ''}`}
            onClick={() => setDetailedView('worst_units')}
          >
            Top 10 Worst Performers – Units
          </button>
          <button
            type="button"
            className={`btn-chip ${detailedView === 'best_revenue' ? 'active' : ''}`}
            onClick={() => setDetailedView('best_revenue')}
          >
            Top 10 Best Performers – Revenue
          </button>
          <button
            type="button"
            className={`btn-chip ${detailedView === 'worst_revenue' ? 'active' : ''}`}
            onClick={() => setDetailedView('worst_revenue')}
          >
            Top 10 Worst Performers – Revenue
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ASIN</th>
                <th>Product Name</th>
                <th>Product Category</th>
                <th>Pack Size</th>
                <th>Sales Channel</th>
                <th>Report Month</th>
                <th className="col-num">Overall Units</th>
                <th className="col-num">Overall Revenue</th>
                <th className="col-num">Ad Units</th>
                <th className="col-num">Ad Revenue</th>
                <th className="col-num">Organic Units</th>
                <th className="col-num">Organic Revenue</th>
                <th className="col-num">New to Brand</th>
                <th className="col-num">Repeat</th>
                <th className="col-num">Promo</th>
                <th className="col-num">AOV</th>
                <th className="col-num">TACoS %</th>
                <th className="cell-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.id}>
                  <td><span className="text-secondary">{row.asin ?? '—'}</span></td>
                  <td>
                    <div className="cell-product">
                      <div className="table-thumb" aria-hidden>—</div>
                      <div>{row.productName ?? '—'}</div>
                    </div>
                  </td>
                  <td>{row.productCategory ?? '—'}</td>
                  <td>{row.packSize ?? '—'}</td>
                  <td>{row.salesChannel ?? '—'}</td>
                  <td>{row.reportMonth ?? '—'}</td>
                  <td className="col-num">{Number(row.overallUnit) || 0}</td>
                  <td className="col-num">{(Number(row.overallRevenue) || 0).toLocaleString()}</td>
                  <td className="col-num">{Number(row.adUnit) || 0}</td>
                  <td className="col-num">{(Number(row.adRevenue) || 0).toLocaleString()}</td>
                  <td className="col-num">{Number(row.organicUnit) || 0}</td>
                  <td className="col-num">{(Number(row.organicRevenue) || 0).toLocaleString()}</td>
                  <td className="col-num">{Number(row.newToBrandUnit) || 0}</td>
                  <td className="col-num">{Number(row.repeatUnit) || 0}</td>
                  <td className="col-num">{Number(row.promotionalUnit) || 0}</td>
                  <td className="col-num">{(Number(row.aov) || 0).toFixed(2)}</td>
                  <td className="col-num">{(Number(row.tacos) || 0).toFixed(1)}%</td>
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
