import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';
import { formatDateDDMonYY } from '../../utils/dateFormat';

const STOCK_FILTERS = [
  { id: 'NO_BUYBOX', label: 'ASINs with no Buybox' },
  { id: 'ALL_SKUS', label: 'All ASINs' },
];

// API and backend use YYYY-MM-DD. Use this to normalize for comparison.
const normalizeReportDate = (value) => {
  if (!value) return '';
  const s = String(value);
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const normalizeOwner = (owner) => (owner != null ? String(owner).trim().toLowerCase() : '');
const isAmazonAeOwner = (owner) => normalizeOwner(owner).includes('amazon.ae');

const textOrZero = (value) => {
  if (value == null || value === '') return '0';
  return String(value);
};

const percentOrZero = (value) => {
  if (value == null || value === '') return '0.00%';
  const s = String(value).trim();
  if (!s) return '0.00%';
  if (s.includes('%')) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
};

const formatAed = (value) => {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return 'AED 0';
  return `AED ${Math.round(n).toLocaleString()}`;
};

const pick = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
};

export default function Buybox() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Key Buybox Metrics should reflect currently applied UI filters,
  // so we compute them client-side from filtered rows (not from API summary).
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    packSize: '',
    channel: '',
  });
  const [stockFilter, setStockFilter] = useState('ALL_SKUS');
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
    brand: true,
    productSubCategory: true,
    vendorConfirmationPct: true,
    poReceivedAmount: true,
    poReceivedUnits: true,
    openPOs: true,
    receiveFillRate: true,
    overallVendorLeadTimeDays: true,
    aged90PlusSellableInventory: true,
    aged90PlusSellableUnits: true,
    sellableInventoryAmount: true,
    availableInventory: true,
    unsellableOnHandInventoryAmount: true,
    unsellableOnHandUnits: true,
    reportDate: true,
    packSize: true,
    salesChannel: true,
    inStockFlag: true,
    cumulativeInstockDays: true,
    dayOfMonth: true,
    instockRate: true,
    oosDate: true,
    totalSales: true,
    totalUnits: true,
    sellThrough: true,
    dos: true,
    minAvailableQty: true,
    maxAvailableQty: true,
    stockStatus: true,
    noLowStockWtOpenPOs: true,
    noLowStockWtNoOpenPOs: true,
    productName: true,
    packType: true,
    scIdealPrice: true,
    vcIdealPrice: true,
    productCategory: true,
    currentOwner: true,
    currentOwnerPrice: true,
    currentOwnerMOQ: true,
    hijacker1: true,
    hijacker1Price: true,
    hijacker1MOQ: true,
    hijacker2: true,
    hijacker2Price: true,
    hijacker2MOQ: true,
    hijacker3: true,
    hijacker3Price: true,
    hijacker3MOQ: true,
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [salesChannelOptionsFromApi, setSalesChannelOptionsFromApi] = useState([]);
  const [asinListModal, setAsinListModal] = useState(null); // null | 'with_buybox' | 'no_buybox'

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (selectedDate) {
      params.customRangeStart = selectedDate;
      params.customRangeEnd = selectedDate;
    }
    dashboardApi
      .getBuybox(params)
      .then((data) => {
        const apiRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(apiRows);
        setComparison(data?.comparison ?? null);
        setUpdatedAt(data?.updatedAt ?? null);
        setSalesChannelOptionsFromApi(Array.isArray(data.salesChannelOptions) ? data.salesChannelOptions : []);
      })
      .catch((e) => {
        setError(e.message);
        setComparison(null);
      })
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const rowsForSelectedDate = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter((row) => normalizeReportDate(row.reportDate) === selectedDate);
  }, [rows, selectedDate]);

  const asinOptions = useMemo(
    () => Array.from(new Set(rowsForSelectedDate.map((r) => r.asin).filter(Boolean))),
    [rowsForSelectedDate],
  );
  const productNameOptions = useMemo(
    () => Array.from(new Set(rowsForSelectedDate.map((r) => r.productName).filter(Boolean))),
    [rowsForSelectedDate],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rowsForSelectedDate
            .map((r) => r.productCategory)
            .filter(Boolean),
        ),
      ),
    [rowsForSelectedDate],
  );
  const packSizeOptions = useMemo(
    () => Array.from(new Set(rowsForSelectedDate.map((r) => r.packSize).filter(Boolean))),
    [rowsForSelectedDate],
  );
  // Use API-provided list (all unique Sales Channels in DB) when available; else derive from current rows
  const channelOptions = useMemo(() => {
    if (salesChannelOptionsFromApi.length > 0) {
      return salesChannelOptionsFromApi;
    }
    const seen = new Map();
    rows.forEach((r) => {
      const val = String(r.salesChannel || r.channel || r['Sales Channel'] || '').trim();
      if (val && !seen.has(val.toLowerCase())) seen.set(val.toLowerCase(), val);
    });
    return Array.from(seen.values()).sort((a, b) => String(a).localeCompare(String(b)));
  }, [rows, salesChannelOptionsFromApi]);

  const filteredRows = useMemo(() => {
    return rowsForSelectedDate.filter((row) => {
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
      const channelValue = String(row.salesChannel || row.channel || row['Sales Channel'] || '').trim();
      if (filters.channel && channelValue.toLowerCase() !== filters.channel.toLowerCase()) return false;

      if (stockFilter === 'NO_BUYBOX' && isAmazonAeOwner(row.currentBuyboxOwner)) return false;

      return true;
    });
  }, [rowsForSelectedDate, filters, stockFilter]);

  const summaryComputed = useMemo(() => {
    if (!filteredRows.length) {
      return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    }
    const asinToOwner = new Map();
    filteredRows.forEach((r) => {
      if (r.asin) asinToOwner.set(r.asin, normalizeOwner(r.currentBuyboxOwner));
    });
    const uniqueAsins = [...asinToOwner.keys()];
    const totalAsins = uniqueAsins.length;
    if (!totalAsins) return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    const amazonAeCount = uniqueAsins.filter((asin) => (asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const noBuyboxSkus = uniqueAsins.filter((asin) => !(asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const overallBuyboxPct = Math.round((amazonAeCount / totalAsins) * 100);
    return { overallBuyboxPct, noBuyboxSkus, amazonAeCount };
  }, [filteredRows]);

  const summary = summaryComputed;

  /** One row per ASIN for modal tables (first occurrence in filtered rows). */
  const asinListForModal = useMemo(() => {
    const byAsin = new Map();
    filteredRows.forEach((r) => {
      if (r.asin && !byAsin.has(r.asin)) byAsin.set(r.asin, r);
    });
    const withBuybox = [];
    const noBuybox = [];
    byAsin.forEach((row) => {
      if (isAmazonAeOwner(row.currentBuyboxOwner)) withBuybox.push(row);
      else noBuybox.push(row);
    });
    return { withBuybox, noBuybox };
  }, [filteredRows]);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => ({ ...prev, [id]: !prev[id] }));
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
    setSelectedDate(maxSelectableDateStr);
  };

  const hasFiltersToClear =
    selectedDate !== maxSelectableDateStr ||
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.packSize ||
    filters.channel !== '' ||
    stockFilter !== 'ALL_SKUS';

  const kpiTrends = useMemo(() => {
    const fallback = { value: '—', type: 'neutral' };
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      if (pct >= 0) return `↑${pct}%`;
      return `↓${Math.abs(pct)}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    if (!comparison) return { overallBuyboxPct: fallback, noBuyboxSkus: fallback, amazonAeCount: fallback };

    const makeTrend = (pctChange, currentValue) => {
      // When the current metric is zero (e.g. 0 ASINs or 0%),
      // hide the arrow and percentage to avoid confusing "0 (↑x%)" displays.
      if (!currentValue) return fallback;
      return { value: fmt(pctChange), type: type(pctChange) };
    };

    return {
      overallBuyboxPct: makeTrend(comparison.overallBuyboxPct?.pctChange, summary.overallBuyboxPct),
      noBuyboxSkus: makeTrend(comparison.noBuyboxSkus?.pctChange, summary.noBuyboxSkus),
      amazonAeCount: makeTrend(comparison.amazonAeCount?.pctChange, summary.amazonAeCount),
    };
  }, [comparison, summary.overallBuyboxPct, summary.noBuyboxSkus, summary.amazonAeCount]);

  const actionsRecommended = [
    { action: 'Action 1', recommendation: 'Review pricing for SKUs without Buybox', status: 'No action taken' },
    { action: 'Action 2', recommendation: 'Lower VC price to match Buybox', status: 'Accepted' },
    { action: 'Action 3', recommendation: 'Investigate hijacker sellers', status: 'In progress' },
    { action: 'Action 4', recommendation: 'Increase inventory for high DOS SKUs', status: 'No action required' },
  ];

  const closeAsinListModal = () => setAsinListModal(null);

  const renderAsinListModal = () => {
    if (!asinListModal) return null;
    const isWithBuybox = asinListModal === 'with_buybox';
    const title = isWithBuybox
      ? 'ASINs with Buybox (Amazon.ae) – Breakdown'
      : 'ASINs with no Buybox – Breakdown';
    const rows = isWithBuybox ? asinListForModal.withBuybox : asinListForModal.noBuybox;
    const columns = ['ASIN', 'Product Name', 'Sales Channel', 'Current Owner'];
    return (
      <div className="modal-backdrop" onClick={closeAsinListModal}>
        <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{title}</h3>
            <button type="button" className="btn-logout" onClick={closeAsinListModal}>
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
                {rows.map((row) => (
                  <tr key={row.asin}>
                    <td>{textOrZero(row.asin)}</td>
                    <td>{textOrZero(pick(row, ['Product Name', 'productName']))}</td>
                    <td>{textOrZero(pick(row, ['Sales Channel', 'salesChannel', 'channel']))}</td>
                    <td>{textOrZero(pick(row, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']))}</td>
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

  const dataUpdatedDate = updatedAt ? String(updatedAt).split('T')[0] : null;
  const dataUpdatedDisplay = dataUpdatedDate ? formatDateDDMonYY(dataUpdatedDate) : null;

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
              <input
                type="date"
                value={selectedDate}
                max={maxSelectableDateStr}
                onChange={(e) => setSelectedDate(e.target.value)}
                aria-label="Buybox date"
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
          <h3 className="exec-kpi-title">Key Buybox Metrics</h3>
          {dataUpdatedDisplay && (
            <span className="exec-updated-text">
              <span className="pulse-dot" />
              Data updated as of <strong>{dataUpdatedDisplay}</strong>
            </span>
          )}
        </div>
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
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-violet"
            onClick={() => setAsinListModal('with_buybox')}
          >
            <div className="label">No. of ASINs with Buybox (Amazon.ae)</div>
            <div className="value value-primary">
              {summary.amazonAeCount}
              <span className={`kpi-trend-inline ${kpiTrends.amazonAeCount.type === 'negative' ? 'negative' : kpiTrends.amazonAeCount.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.amazonAeCount.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
          <button
            type="button"
            className="kpi-item kpi-clickable kpi-amber"
            onClick={() => setAsinListModal('no_buybox')}
          >
            <div className="label">No. of ASINs with no Buybox</div>
            <div className="value value-primary">
              {summary.noBuyboxSkus}
              <span className={`kpi-trend-inline ${kpiTrends.noBuyboxSkus.type === 'positive' ? 'negative' : kpiTrends.noBuyboxSkus.type === 'neutral' ? 'neutral' : ''}`}>
                ({kpiTrends.noBuyboxSkus.value})
              </span>
            </div>
            <div className="value-secondary">vs last period</div>
          </button>
          <div className="kpi-item kpi-blue">
            <div className="label">Actions Recommended</div>
            <div className="value value-primary">0</div>
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
                  { id: 'brand', label: 'Brand' },
                  { id: 'productSubCategory', label: 'Product Sub Category' },
                  { id: 'vendorConfirmationPct', label: 'Vendor Confirmation %' },
                  { id: 'poReceivedAmount', label: 'PO_received_amount' },
                  { id: 'poReceivedUnits', label: 'PO_received_Units' },
                  { id: 'openPOs', label: 'Open POs' },
                  { id: 'receiveFillRate', label: 'Receive_Fill_Rate' },
                  { id: 'overallVendorLeadTimeDays', label: 'Overall Vendor Lead Time (days)' },
                  { id: 'aged90PlusSellableInventory', label: 'Aged 90+ Days Sellable Inventory' },
                  { id: 'aged90PlusSellableUnits', label: 'Aged 90+ Days Sellable Units' },
                  { id: 'sellableInventoryAmount', label: 'Sellable Inventory Amount' },
                  { id: 'availableInventory', label: 'Available Inventory' },
                  { id: 'unsellableOnHandInventoryAmount', label: 'Unsellable On Hand Inventory Amount' },
                  { id: 'unsellableOnHandUnits', label: 'Unsellable On Hand Units' },
                  { id: 'reportDate', label: 'Date' },
                  { id: 'packSize', label: 'Pack Size' },
                  { id: 'salesChannel', label: 'Sales Channel' },
                  { id: 'inStockFlag', label: 'in_stock_flag' },
                  { id: 'cumulativeInstockDays', label: 'cumulative_instock_days' },
                  { id: 'dayOfMonth', label: 'day_of_month' },
                  { id: 'instockRate', label: 'Instock Rate' },
                  { id: 'oosDate', label: 'OOS Date' },
                  { id: 'totalSales', label: 'total_sales' },
                  { id: 'totalUnits', label: 'total_units' },
                  { id: 'sellThrough', label: 'sell_through' },
                  { id: 'dos', label: 'DOS' },
                  { id: 'minAvailableQty', label: 'min_available_qty' },
                  { id: 'maxAvailableQty', label: 'max_available_qty' },
                  { id: 'stockStatus', label: 'Stock_Status' },
                  { id: 'noLowStockWtOpenPOs', label: 'No/Low Stock wt Open POs' },
                  { id: 'noLowStockWtNoOpenPOs', label: 'No/Low Stock wt no Open POs' },
                  { id: 'productName', label: 'Product Name' },
                  { id: 'packType', label: 'Pack Type' },
                  { id: 'scIdealPrice', label: 'SC Ideal Price' },
                  { id: 'vcIdealPrice', label: 'VC Ideal Price' },
                  { id: 'productCategory', label: 'Product Category' },
                  { id: 'currentOwner', label: 'Current Owner' },
                  { id: 'currentOwnerPrice', label: 'Current Owner Price' },
                  { id: 'currentOwnerMOQ', label: 'Current Owner MOQ' },
                  { id: 'hijacker1', label: 'Hijacker 1' },
                  { id: 'hijacker1Price', label: 'Hijacker 1 Price' },
                  { id: 'hijacker1MOQ', label: 'Hijacker 1 MOQ' },
                  { id: 'hijacker2', label: 'Hijacker 2' },
                  { id: 'hijacker2Price', label: 'Hijacker 2 Price' },
                  { id: 'hijacker2MOQ', label: 'Hijacker 2 MOQ' },
                  { id: 'hijacker3', label: 'Hijacker 3' },
                  { id: 'hijacker3Price', label: 'Hijacker 3 Price' },
                  { id: 'hijacker3MOQ', label: 'Hijacker 3 MOQ' },
                ].map((col) => (
                  <label key={col.id} className="column-picker-item">
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.id]}
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
                {visibleColumns.brand && <th>Brand</th>}
                {visibleColumns.productSubCategory && <th>Product Sub Category</th>}
                {visibleColumns.vendorConfirmationPct && <th>Vendor Confirmation %</th>}
                {visibleColumns.poReceivedAmount && <th>PO_received_amount</th>}
                {visibleColumns.poReceivedUnits && <th>PO_received_Units</th>}
                {visibleColumns.openPOs && <th>Open POs</th>}
                {visibleColumns.receiveFillRate && <th>Receive_Fill_Rate</th>}
                {visibleColumns.overallVendorLeadTimeDays && <th>Overall Vendor Lead Time (days)</th>}
                {visibleColumns.aged90PlusSellableInventory && <th>Aged 90+ Days Sellable Inventory</th>}
                {visibleColumns.aged90PlusSellableUnits && <th>Aged 90+ Days Sellable Units</th>}
                {visibleColumns.sellableInventoryAmount && <th>Sellable Inventory Amount</th>}
                {visibleColumns.availableInventory && <th>Available Inventory</th>}
                {visibleColumns.unsellableOnHandInventoryAmount && <th>Unsellable On Hand Inventory Amount</th>}
                {visibleColumns.unsellableOnHandUnits && <th>Unsellable On Hand Units</th>}
                {visibleColumns.reportDate && <th>Date</th>}
                {visibleColumns.packSize && <th>Pack Size</th>}
                {visibleColumns.salesChannel && <th>Sales Channel</th>}
                {visibleColumns.inStockFlag && <th>in_stock_flag</th>}
                {visibleColumns.cumulativeInstockDays && <th>cumulative_instock_days</th>}
                {visibleColumns.dayOfMonth && <th>day_of_month</th>}
                {visibleColumns.instockRate && <th>Instock Rate</th>}
                {visibleColumns.oosDate && <th>OOS Date</th>}
                {visibleColumns.totalSales && <th>total_sales</th>}
                {visibleColumns.totalUnits && <th>total_units</th>}
                {visibleColumns.sellThrough && <th>sell_through</th>}
                {visibleColumns.dos && <th>DOS</th>}
                {visibleColumns.minAvailableQty && <th>min_available_qty</th>}
                {visibleColumns.maxAvailableQty && <th>max_available_qty</th>}
                {visibleColumns.stockStatus && <th>Stock_Status</th>}
                {visibleColumns.noLowStockWtOpenPOs && <th>No/Low Stock wt Open POs</th>}
                {visibleColumns.noLowStockWtNoOpenPOs && <th>No/Low Stock wt no Open POs</th>}
                {visibleColumns.productName && <th>Product Name</th>}
                {visibleColumns.packType && <th>Pack Type</th>}
                {visibleColumns.scIdealPrice && <th>SC Ideal Price</th>}
                {visibleColumns.vcIdealPrice && <th>VC Ideal Price</th>}
                {visibleColumns.productCategory && <th>Product Category</th>}
                {visibleColumns.currentOwner && <th>Current Owner</th>}
                {visibleColumns.currentOwnerPrice && <th>Current Owner Price</th>}
                {visibleColumns.currentOwnerMOQ && <th>Current Owner MOQ</th>}
                {visibleColumns.hijacker1 && <th>Hijacker 1</th>}
                {visibleColumns.hijacker1Price && <th>Hijacker 1 Price</th>}
                {visibleColumns.hijacker1MOQ && <th>Hijacker 1 MOQ</th>}
                {visibleColumns.hijacker2 && <th>Hijacker 2</th>}
                {visibleColumns.hijacker2Price && <th>Hijacker 2 Price</th>}
                {visibleColumns.hijacker2MOQ && <th>Hijacker 2 MOQ</th>}
                {visibleColumns.hijacker3 && <th>Hijacker 3</th>}
                {visibleColumns.hijacker3Price && <th>Hijacker 3 Price</th>}
                {visibleColumns.hijacker3MOQ && <th>Hijacker 3 MOQ</th>}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row._id ?? row.id ?? row.asin ?? `${row.productName || 'row'}-${row.reportDate || ''}`}>
                  {visibleColumns.asin && <td>{textOrZero(row.asin)}</td>}
                  {visibleColumns.brand && <td>{textOrZero(pick(row, ['Brand', 'brand']))}</td>}
                  {visibleColumns.productSubCategory && <td>{textOrZero(pick(row, ['Product Sub Category', 'productSubCategory']))}</td>}
                  {visibleColumns.vendorConfirmationPct && <td>{percentOrZero(pick(row, ['Vendor Confirmation %', 'vendorConfirmationPct']))}</td>}
                  {visibleColumns.poReceivedAmount && <td>{formatAed(pick(row, ['PO_received_amount', 'poReceivedAmount']))}</td>}
                  {visibleColumns.poReceivedUnits && <td>{textOrZero(pick(row, ['PO_received_Units', 'poReceivedUnits']))}</td>}
                  {visibleColumns.openPOs && <td>{textOrZero(pick(row, ['Open POs', 'openPOs']))}</td>}
                  {visibleColumns.receiveFillRate && <td>{percentOrZero(pick(row, ['Receive_Fill_Rate', 'receiveFillRate']))}</td>}
                  {visibleColumns.overallVendorLeadTimeDays && <td>{textOrZero(pick(row, ['Overall Vendor Lead Time (days)', 'overallVendorLeadTimeDays']))}</td>}
                  {visibleColumns.aged90PlusSellableInventory && <td>{textOrZero(pick(row, ['Aged 90+ Days Sellable Inventory', 'aged90PlusSellableInventory']))}</td>}
                  {visibleColumns.aged90PlusSellableUnits && <td>{textOrZero(pick(row, ['Aged 90+ Days Sellable Units', 'aged90PlusSellableUnits']))}</td>}
                  {visibleColumns.sellableInventoryAmount && <td>{formatAed(pick(row, ['Sellable Inventory Amount', 'sellableInventoryAmount']))}</td>}
                  {visibleColumns.availableInventory && <td>{textOrZero(pick(row, ['Available Inventory', 'availableInventory']))}</td>}
                  {visibleColumns.unsellableOnHandInventoryAmount && <td>{textOrZero(pick(row, ['Unsellable On Hand Inventory Amount', 'unsellableOnHandInventoryAmount']))}</td>}
                  {visibleColumns.unsellableOnHandUnits && <td>{textOrZero(pick(row, ['Unsellable On Hand Units', 'unsellableOnHandUnits']))}</td>}
                  {visibleColumns.reportDate && (
                    <td>{(() => {
                      const v = pick(row, ['Date', 'reportDate']);
                      const s = v == null ? '' : String(v);
                      return s ? formatDateDDMonYY(s.slice(0, 10)) : '0';
                    })()}</td>
                  )}
                  {visibleColumns.packSize && <td>{textOrZero(row.packSize)}</td>}
                  {visibleColumns.salesChannel && <td>{textOrZero(pick(row, ['Sales Channel', 'salesChannel', 'channel']))}</td>}
                  {visibleColumns.inStockFlag && <td>{textOrZero(pick(row, ['in_stock_flag', 'inStockFlag']))}</td>}
                  {visibleColumns.cumulativeInstockDays && <td>{textOrZero(pick(row, ['cumulative_instock_days', 'cumulativeInstockDays']))}</td>}
                  {visibleColumns.dayOfMonth && <td>{textOrZero(pick(row, ['day_of_month', 'dayOfMonth']))}</td>}
                  {visibleColumns.instockRate && <td>{textOrZero(pick(row, ['Instock Rate', 'instockRate']))}</td>}
                  {visibleColumns.oosDate && <td>{textOrZero(pick(row, ['OOS Date', 'oosDate']))}</td>}
                  {visibleColumns.totalSales && <td>{formatAed(pick(row, ['total_sales', 'totalSales']))}</td>}
                  {visibleColumns.totalUnits && <td>{textOrZero(pick(row, ['total_units', 'totalUnits']))}</td>}
                  {visibleColumns.sellThrough && <td>{textOrZero(pick(row, ['sell_through', 'sellThrough']))}</td>}
                  {visibleColumns.dos && <td>{textOrZero(pick(row, ['DOS', 'dos']))}</td>}
                  {visibleColumns.minAvailableQty && <td>{textOrZero(pick(row, ['min_available_qty', 'minAvailableQty']))}</td>}
                  {visibleColumns.maxAvailableQty && <td>{textOrZero(pick(row, ['max_available_qty', 'maxAvailableQty']))}</td>}
                  {visibleColumns.stockStatus && <td>{textOrZero(pick(row, ['Stock_Status', 'stockStatus']))}</td>}
                  {visibleColumns.noLowStockWtOpenPOs && <td>{textOrZero(pick(row, ['No/Low Stock wt Open POs', 'noLowStockWtOpenPOs']))}</td>}
                  {visibleColumns.noLowStockWtNoOpenPOs && <td>{textOrZero(pick(row, ['No/Low Stock wt no Open POs', 'noLowStockWtNoOpenPOs']))}</td>}
                  {visibleColumns.productName && <td>{textOrZero(pick(row, ['Product Name', 'productName']))}</td>}
                  {visibleColumns.packType && <td>{textOrZero(pick(row, ['Pack Type', 'packType']))}</td>}
                  {visibleColumns.scIdealPrice && <td>{textOrZero(pick(row, ['SC Ideal Price', 'scIdealPrice']))}</td>}
                  {visibleColumns.vcIdealPrice && <td>{textOrZero(pick(row, ['VC Ideal Price', 'vcIdealPrice']))}</td>}
                  {visibleColumns.productCategory && <td>{textOrZero(pick(row, ['Product Category', 'productCategory']))}</td>}
                  {visibleColumns.currentOwner && <td>{textOrZero(pick(row, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']))}</td>}
                  {visibleColumns.currentOwnerPrice && <td>{formatAed(pick(row, ['Current Owner Price', 'currentOwnerPrice', 'currentBuyboxPrice']))}</td>}
                  {visibleColumns.currentOwnerMOQ && <td>{textOrZero(pick(row, ['Current Owner MOQ', 'currentOwnerMOQ', 'moq']))}</td>}

                  {visibleColumns.hijacker1 && <td>{textOrZero(pick(row, ['Hijacker 1', 'hijacker1']))}</td>}
                  {visibleColumns.hijacker1Price && <td>{formatAed(pick(row, ['Hijacker 1 Price', 'hijacker1Price']))}</td>}
                  {visibleColumns.hijacker1MOQ && <td>{textOrZero(pick(row, ['Hijacker 1 MOQ', 'hijacker1MOQ']))}</td>}
                  {visibleColumns.hijacker2 && <td>{textOrZero(pick(row, ['Hijacker 2', 'hijacker2']))}</td>}
                  {visibleColumns.hijacker2Price && <td>{formatAed(pick(row, ['Hijacker 2 Price', 'hijacker2Price']))}</td>}
                  {visibleColumns.hijacker2MOQ && <td>{textOrZero(pick(row, ['Hijacker 2 MOQ', 'hijacker2MOQ']))}</td>}
                  {visibleColumns.hijacker3 && <td>{textOrZero(pick(row, ['Hijacker 3', 'hijacker3']))}</td>}
                  {visibleColumns.hijacker3Price && <td>{formatAed(pick(row, ['Hijacker 3 Price', 'hijacker3Price']))}</td>}
                  {visibleColumns.hijacker3MOQ && <td>{textOrZero(pick(row, ['Hijacker 3 MOQ', 'hijacker3MOQ']))}</td>}
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

      {renderAsinListModal()}
    </>
  );
}
