import { useState, useMemo, useEffect } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';
import { formatDateDDMonYY } from '../../utils/dateFormat';

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

/* Fallback when comparison not yet loaded */
const KPI_TRENDS_FALLBACK = {
  overall: { value: '—', type: 'neutral' },
  ad: { value: '—', type: 'neutral' },
  organic: { value: '—', type: 'neutral' },
  tacos: { value: '—', type: 'neutral' },
  adSpend: { value: '—', type: 'neutral' },
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

/** Current vs comparison period month lists (mirrors backend; T-3 for "current"). */
function getPeriodMonths(dateFilterType, customStart, customEnd) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 3);
  const y = now.getFullYear();
  const m = now.getMonth();
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
    return { current: monthList(y, m, 1), comparison: monthList(y, m - 1, 1) };
  }
  if (dateFilterType === 'PREVIOUS_MONTH') {
    return { current: monthList(y, m - 1, 1), comparison: monthList(y, m - 2, 1) };
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
    return { current, comparison: monthList(compStart.getFullYear(), compStart.getMonth(), len) };
  }
  if (dateFilterType === 'CURRENT_YEAR') {
    return { current: monthList(y, 0, 12), comparison: monthList(y - 1, 0, 12) };
  }
  if (dateFilterType === 'PREVIOUS_YEAR') {
    return { current: monthList(y - 1, 0, 12), comparison: monthList(y - 2, 0, 12) };
  }
  return null;
}

function pctChange(currentVal, previousVal) {
  if (previousVal == null || previousVal === 0 || !Number.isFinite(previousVal)) return null;
  if (currentVal == null || !Number.isFinite(currentVal)) return null;
  return ((currentVal - previousVal) / previousVal) * 100;
}

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
  const [dateFilterType, setDateFilterType] = useState('CURRENT_MONTH');
  const [customRangeStart, setCustomRangeStart] = useState('');
  const [customRangeEnd, setCustomRangeEnd] = useState('');
  const [showCustomRangePicker, setShowCustomRangePicker] = useState(false);
  const [isMonthRangeDialogOpen, setIsMonthRangeDialogOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [tempRange, setTempRange] = useState({ start: null, end: null });
  const [metricModal, setMetricModal] = useState(null);
  const [detailedView, setDetailedView] = useState('all'); // 'all' | 'best_units' | 'worst_units' | 'best_revenue' | 'worst_revenue'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [comparison, setComparison] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [latestUpdatedAtByChannel, setLatestUpdatedAtByChannel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = {};
    if (dateFilterType) params.dateFilterType = dateFilterType;
    if (customRangeStart) params.customRangeStart = customRangeStart;
    if (customRangeEnd) params.customRangeEnd = customRangeEnd;
    dashboardApi
      .getRevenue(params)
      .then((data) => {
        if (!cancelled && data?.rows) setRevenueRows(data.rows);
        if (!cancelled) {
          setComparison(data?.comparison ?? null);
          setUpdatedAt(data?.updatedAt ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load revenue data');
        if (!cancelled) setComparison(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dateFilterType, customRangeStart, customRangeEnd]);

  useEffect(() => {
    let cancelled = false;
    const channel = filters.channel ? String(filters.channel).trim() : '';
    dashboardApi
      .getLatestUpdatedDate({ dataset: 'revenue', salesChannel: channel })
      .then((resp) => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(resp?.updatedAt ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(null);
      });
    return () => { cancelled = true; };
  }, [filters.channel]);

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
  const channelOptions = useMemo(() => {
    const raw = Array.from(
      new Set(
        revenueRows
          .map((r) => r.salesChannel || r.channel)
          .filter(Boolean)
          .map((v) => String(v).trim())
          .filter(Boolean),
      ),
    );
    return raw.sort((a, b) => String(a).localeCompare(String(b)));
  }, [revenueRows]);

  const applyNonDateFilters = (row) => {
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
    if (filters.channel && (row.salesChannel || row.channel) !== filters.channel) return false;
    return true;
  };

  const applyFilters = (row) => {
    if (!applyNonDateFilters(row)) return false;
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

  const totalRows = tableRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRows = tableRows.slice(startIndex, endIndex);

  const summary = useMemo(() => {
    if (!filteredRows.length) {
      return {
        overallUnit: 0,
        overallRevenue: 0,
        adUnit: 0,
        adRevenue: 0,
        organicUnit: 0,
        organicRevenue: 0,
        newToBrandUnit: 0,
        promoRevenue: 0,
        aov: 0,
        tacos: 0,
        adsSpend: 0,
      };
    }
    const totals = filteredRows.reduce(
      (acc, r) => {
        acc.overallUnit += Number(r.overallUnit) || 0;
        acc.overallRevenue += Number(r.overallRevenue) || 0;
        acc.adUnit += Number(r.adUnit) || 0;
        acc.adRevenue += Number(r.adRevenue) || 0;
        acc.organicUnit += Number(r.organicUnit) || 0;
        acc.organicRevenue += Number(r.organicRevenue) || 0;
        acc.newToBrandUnit += Number(r.newToBrandUnit) || 0;
        acc.promoRevenue += (Number(r.promotionalUnit) || 0) * (Number(r.aov) || 0);
        acc.aov += Number(r.aov) || 0;
        // Ads spend: sum actual adSpend from each row (respects date + all filters)
        acc.adsSpend += Number(r.adSpend) || 0;
        return acc;
      },
      {
        overallUnit: 0,
        overallRevenue: 0,
        adUnit: 0,
        adRevenue: 0,
        organicUnit: 0,
        organicRevenue: 0,
        newToBrandUnit: 0,
        promoRevenue: 0,
        aov: 0,
        adsSpend: 0,
      },
    );
    const count = filteredRows.length;
    // TACOS = (Total Ad Spend / Total Sales) * 100 — from summed ads spend and revenue
    const tacos = totals.overallRevenue > 0 ? (totals.adsSpend / totals.overallRevenue) * 100 : 0;
    return {
      ...totals,
      aov: totals.aov / count,
      tacos,
    };
  }, [filteredRows]);

  /** Comparison that respects date period + all filters (current vs previous period). */
  const localComparison = useMemo(() => {
    const periods = getPeriodMonths(dateFilterType, customRangeStart, customRangeEnd);
    if (!periods || !revenueRows.length) return null;
    const currentSet = new Set(periods.current);
    const comparisonSet = new Set(periods.comparison);
    const currentRows = revenueRows.filter(
      (r) => applyNonDateFilters(r) && r.reportMonth && currentSet.has(r.reportMonth),
    );
    const comparisonRows = revenueRows.filter(
      (r) => applyNonDateFilters(r) && r.reportMonth && comparisonSet.has(r.reportMonth),
    );
    const aggregate = (rows) => {
      let overallRevenue = 0;
      let adRevenue = 0;
      let organicRevenue = 0;
      let adSpend = 0;
      rows.forEach((r) => {
        overallRevenue += Number(r.overallRevenue) || 0;
        adRevenue += Number(r.adRevenue) || 0;
        organicRevenue += Number(r.organicRevenue) || 0;
        adSpend += Number(r.adSpend) || 0;
      });
      const tacos = overallRevenue > 0 ? (adSpend / overallRevenue) * 100 : 0;
      return { overallRevenue, adRevenue, organicRevenue, adSpend, tacos };
    };
    const curr = aggregate(currentRows);
    const prev = aggregate(comparisonRows);
    const fmt = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
    return {
      overall: { pctChange: fmt(pctChange(curr.overallRevenue, prev.overallRevenue)) },
      ad: { pctChange: fmt(pctChange(curr.adRevenue, prev.adRevenue)) },
      organic: { pctChange: fmt(pctChange(curr.organicRevenue, prev.organicRevenue)) },
      tacos: { pctChange: fmt(pctChange(curr.tacos, prev.tacos)) },
      adSpend: { pctChange: fmt(pctChange(curr.adSpend, prev.adSpend)) },
    };
  }, [dateFilterType, customRangeStart, customRangeEnd, revenueRows, filters.search, filters.asin, filters.productName, filters.category, filters.channel]);

  const kpiTrends = useMemo(() => {
    const source = localComparison || comparison;
    if (!source) return KPI_TRENDS_FALLBACK;
    // Use ↑ for positive, ↓ for negative (instead of + / -)
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      if (pct >= 0) return `↑${pct}%`;
      return `↓${Math.abs(pct)}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    return {
      overall: { value: fmt(source.overall?.pctChange), type: type(source.overall?.pctChange) },
      ad: { value: fmt(source.ad?.pctChange), type: type(source.ad?.pctChange) },
      organic: { value: fmt(source.organic?.pctChange), type: type(source.organic?.pctChange) },
      tacos: { value: fmt(source.tacos?.pctChange), type: type(source.tacos?.pctChange) },
      adSpend: { value: fmt(source.adSpend?.pctChange), type: type(source.adSpend?.pctChange) },
    };
  }, [localComparison, comparison]);

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

  /* Only show clear when user has changed something from default (e.g. not just "Current Month" with no filters) */
  const hasFiltersToClear =
    dateFilterType !== 'CURRENT_MONTH' ||
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
        title = 'TACOS – Breakdown';
        columns = ['ASIN', 'Product Name', 'Channel', 'TACOS %'];
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
                {filteredRows.map((row) => {
                  const overallRevenue = Number(row.overallRevenue) || 0;
                  const adRevenue = Number(row.adRevenue) || 0;
                  const organicRevenue = Number(row.organicRevenue) || 0;
                  const tacosPct = Number(row.tacos) || 0;

                  return (
                    <tr key={row.id}>
                      {metricModal === METRIC_IDS.OVERALL && (
                        <>
                          <td>{row.asin ?? '—'}</td>
                          <td>{row.productName ?? '—'}</td>
                          <td>{row.salesChannel ?? '—'}</td>
                          <td>{Number(row.overallUnit) || 0}</td>
                          <td>AED {Math.round(overallRevenue).toLocaleString()}</td>
                        </>
                      )}
                      {metricModal === METRIC_IDS.AD && (
                        <>
                          <td>{row.asin ?? '—'}</td>
                          <td>{row.productName ?? '—'}</td>
                          <td>{row.salesChannel ?? '—'}</td>
                          <td>{Number(row.adUnit) || 0}</td>
                          <td>AED {Math.round(adRevenue).toLocaleString()}</td>
                        </>
                      )}
                      {metricModal === METRIC_IDS.ORGANIC && (
                        <>
                          <td>{row.asin ?? '—'}</td>
                          <td>{row.productName ?? '—'}</td>
                          <td>{row.salesChannel ?? '—'}</td>
                          <td>{Number(row.organicUnit) || 0}</td>
                          <td>AED {Math.round(organicRevenue).toLocaleString()}</td>
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
                          <td>{tacosPct.toFixed(1)}%</td>
                        </>
                      )}
                    </tr>
                  );
                })}
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

  const dataUpdatedDate = (latestUpdatedAtByChannel || updatedAt)
    ? formatDateDDMonYY(String(latestUpdatedAtByChannel || updatedAt).split('T')[0])
    : null;

  if (loading) {
    return (
      <>
        <div className="card">
          <p className="section-muted">Loading revenue data...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="card">
          <p className="section-muted" style={{ color: 'var(--color-error, #c00)' }}>{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="card revenue-filters-card">
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
              <option value="">{filters.asin ? 'Select All' : 'ASIN'}</option>
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
              <option value="">{filters.productName ? 'Select All' : 'Product Name'}</option>
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
              <option value="">{filters.category ? 'Select All' : 'Product Category'}</option>
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
              <option value="">Select All</option>
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
        </div>
      </div>

      <div className="card">
        <div className="exec-kpi-top">
          <h3 className="exec-kpi-title">Key Revenue Metrics</h3>
          {dataUpdatedDate && (
            <span className="exec-updated-text">
              <span className="pulse-dot" />
              Data updated as of <strong>{dataUpdatedDate}</strong>
            </span>
          )}
        </div>
        <div
          className="kpi-grid revenue-kpi-grid"
          style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
        >
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.OVERALL)}
          >
            <div className="label">Overall Unit / Revenue</div>
            <div className="value value-primary">
              AED {Math.round(summary.overallRevenue).toLocaleString()}
              <span
                className={`kpi-trend-inline ${kpiTrends.overall.type === 'negative' ? 'negative' : kpiTrends.overall.type === 'neutral' ? 'neutral' : ''}`}
                style={{ fontSize: '0.75rem' }}
              >
                ({kpiTrends.overall.value})
              </span>
            </div>
            <div className="value-secondary">{summary.overallUnit.toLocaleString()} units</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-violet"
            onClick={() => openMetricModal(METRIC_IDS.AD)}
          >
            <div className="label">Ad Unit / Revenue</div>
            <div className="value value-primary">
              AED {Math.round(summary.adRevenue).toLocaleString()}
              <span
                className={`kpi-trend-inline ${kpiTrends.ad.type === 'negative' ? 'negative' : kpiTrends.ad.type === 'neutral' ? 'neutral' : ''}`}
                style={{ fontSize: '0.75rem' }}
              >
                ({kpiTrends.ad.value})
              </span>
            </div>
            <div className="value-secondary">{summary.adUnit.toLocaleString()} units</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-green"
            onClick={() => openMetricModal(METRIC_IDS.ORGANIC)}
          >
            <div className="label">Organic Unit / Revenue</div>
            <div className="value value-primary">
              AED {Math.round(summary.organicRevenue).toLocaleString()}
              <span
                className={`kpi-trend-inline ${kpiTrends.organic.type === 'negative' ? 'negative' : kpiTrends.organic.type === 'neutral' ? 'neutral' : ''}`}
                style={{ fontSize: '0.75rem' }}
              >
                ({kpiTrends.organic.value})
              </span>
            </div>
            <div className="value-secondary">{summary.organicUnit.toLocaleString()} units</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-blue"
            onClick={() => openMetricModal(METRIC_IDS.TACOS)}
          >
            <div className="label">TACOS</div>
            <div className="value value-primary">
              {summary.tacos.toFixed(1)}%
              <span
                className={`kpi-trend-inline ${kpiTrends.tacos.type === 'positive' ? 'negative' : kpiTrends.tacos.type === 'negative' ? '' : 'neutral'}`}
                style={{ fontSize: '0.75rem' }}
              >
                ({kpiTrends.tacos.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
          <div className="kpi-item kpi-amber">
            <div className="label">Ads Spend</div>
            <div className="value value-primary">
              AED {summary.adsSpend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              <span
                className={`kpi-trend-inline ${kpiTrends.adSpend.type === 'negative' ? 'negative' : kpiTrends.adSpend.type === 'neutral' ? 'neutral' : ''}`}
                style={{ fontSize: '0.75rem' }}
              >
                ({kpiTrends.adSpend.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </div>
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
                <th className="col-num">TACOS %</th>
                <th className="cell-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => {
                const overallRevenue = Number(row.overallRevenue) || 0;
                const adRevenue = Number(row.adRevenue) || 0;
                const organicRevenue = Number(row.organicRevenue) || 0;
                const tacosPct = Number(row.tacos) || 0;

                return (
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
                    <td>{row.reportMonth ? formatDateDDMonYY(row.reportMonth) : '—'}</td>
                    <td className="col-num">{Number(row.overallUnit) || 0}</td>
                    <td className="col-num">AED {Math.round(overallRevenue).toLocaleString()}</td>
                    <td className="col-num">{Number(row.adUnit) || 0}</td>
                    <td className="col-num">AED {Math.round(adRevenue).toLocaleString()}</td>
                    <td className="col-num">{Number(row.organicUnit) || 0}</td>
                    <td className="col-num">AED {Math.round(organicRevenue).toLocaleString()}</td>
                    <td className="col-num">{Number(row.newToBrandUnit) || 0}</td>
                    <td className="col-num">{Number(row.repeatUnit) || 0}</td>
                    <td className="col-num">{Number(row.promotionalUnit) || 0}</td>
                    <td className="col-num">{(Number(row.aov) || 0).toFixed(2)}</td>
                    <td className="col-num">{tacosPct.toFixed(1)}%</td>
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
                );
              })}
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
