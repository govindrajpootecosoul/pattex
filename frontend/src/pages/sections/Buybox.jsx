import { useMemo, useState } from 'react';

const DATE_FILTER_OPTIONS = [
  { id: '', label: '— Select period —' },
  { id: 'CURRENT_MONTH', label: 'Current Month' },
  { id: 'PREVIOUS_MONTH', label: 'Previous Month' },
  { id: 'CURRENT_YEAR', label: 'Current Year' },
  { id: 'PREVIOUS_YEAR', label: 'Previous Year' },
];

const BUYBOX_ROWS = [
  {
    id: 1,
    asin: 'B0BBX001',
    productName: 'Pattex Super Glue 3g',
    productCategory: 'Adhesives',
    packSize: 'Single',
    channel: 'VC',
    availableInventory: 320,
    last30DaysSales: 140,
    dos: 32,
    moq: 50,
    idealVcPrice: 24.5,
    idealScPrice: 25.5,
    hasBuybox: true,
    currentBuyboxOwner: 'Pattex',
    currentBuyboxPrice: 24.9,
    currentVcPrice: 24.9,
    currentScPrice: 26.0,
    hijacker1: null,
    hijacker1Price: null,
    hijacker2: null,
    hijacker2Price: null,
    hijacker3: null,
    hijacker3Price: null,
    actionRequired: 'Monitor',
  },
  {
    id: 2,
    asin: 'B0BBX002',
    productName: 'Pattex Wood Glue 250ml',
    productCategory: 'Wood Glue',
    packSize: 'Single',
    channel: 'SC',
    availableInventory: 210,
    last30DaysSales: 95,
    dos: 45,
    moq: 40,
    idealVcPrice: 29.9,
    idealScPrice: 28.5,
    hasBuybox: false,
    currentBuyboxOwner: 'Seller A',
    currentBuyboxPrice: 27.5,
    currentVcPrice: 30.0,
    currentScPrice: 29.5,
    hijacker1: 'Seller A',
    hijacker1Price: 27.5,
    hijacker2: 'Seller B',
    hijacker2Price: 28.0,
    hijacker3: null,
    hijacker3Price: null,
    actionRequired: 'Price review',
  },
  {
    id: 3,
    asin: 'B0BBX003',
    productName: 'Pattex Repair Extreme 20g',
    productCategory: 'Adhesives',
    packSize: 'Single',
    channel: 'VC',
    availableInventory: 120,
    last30DaysSales: 210,
    dos: 18,
    moq: 30,
    idealVcPrice: 32.0,
    idealScPrice: 31.0,
    hasBuybox: false,
    currentBuyboxOwner: 'Seller B',
    currentBuyboxPrice: 29.9,
    currentVcPrice: 33.0,
    currentScPrice: 34.5,
    hijacker1: 'Seller B',
    hijacker1Price: 29.9,
    hijacker2: 'Seller C',
    hijacker2Price: 30.5,
    hijacker3: 'Seller D',
    hijacker3Price: 31.0,
    actionRequired: 'Buybox recovery',
  },
  {
    id: 4,
    asin: 'B0BBX004',
    productName: 'Pattex Silicone Sealant 280ml',
    productCategory: 'Sealants',
    packSize: 'Single',
    channel: 'VC',
    availableInventory: 560,
    last30DaysSales: 60,
    dos: 90,
    moq: 60,
    idealVcPrice: 19.9,
    idealScPrice: 20.5,
    hasBuybox: true,
    currentBuyboxOwner: 'Pattex',
    currentBuyboxPrice: 19.9,
    currentVcPrice: 19.9,
    currentScPrice: 21.0,
    hijacker1: null,
    hijacker1Price: null,
    hijacker2: null,
    hijacker2Price: null,
    hijacker3: null,
    hijacker3Price: null,
    actionRequired: 'No action',
  },
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
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    packSize: '',
    channel: '',
  });
  const [stockFilter, setStockFilter] = useState('ALL_SKUS');
  const [dateFilterType, setDateFilterType] = useState('');
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

  const asinOptions = useMemo(
    () => Array.from(new Set(BUYBOX_ROWS.map((r) => r.asin).filter(Boolean))),
    [],
  );
  const productNameOptions = useMemo(
    () => Array.from(new Set(BUYBOX_ROWS.map((r) => r.productName).filter(Boolean))),
    [],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(BUYBOX_ROWS.map((r) => r.productCategory).filter(Boolean))),
    [],
  );
  const packSizeOptions = useMemo(
    () => Array.from(new Set(BUYBOX_ROWS.map((r) => r.packSize).filter(Boolean))),
    [],
  );
  const channelOptions = useMemo(
    () => Array.from(new Set(BUYBOX_ROWS.map((r) => r.channel).filter(Boolean))),
    [],
  );

  const dateRange = getDateRangeForFilter(dateFilterType);

  const filteredRows = useMemo(() => {
    return BUYBOX_ROWS.filter((row) => {
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
      if (filters.channel && row.channel !== filters.channel) return false;

      if (stockFilter === 'NO_BUYBOX' && row.hasBuybox) return false;

      if (dateRange && row.reportMonth) {
        if (row.reportMonth < dateRange.start || row.reportMonth > dateRange.end) return false;
      }

      return true;
    });
  }, [filters, stockFilter, dateRange]);

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
    setDateFilterType('');
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

  const actionsRecommended = [
    { action: 'Action 1', recommendation: 'Review pricing for SKUs without Buybox', status: 'No action taken' },
    { action: 'Action 2', recommendation: 'Lower VC price to match Buybox', status: 'Accepted' },
    { action: 'Action 3', recommendation: 'Investigate hijacker sellers', status: 'In progress' },
    { action: 'Action 4', recommendation: 'Increase inventory for high DOS SKUs', status: 'No action required' },
  ];

  return (
    <>
      <h2 className="section-title">Buybox Dashboard</h2>

      <div className="card inventory-filters-card">
        <h3>Filters</h3>
        <div className="filter-row filter-row-one">
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search ASIN, name, category…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <label>ASIN</label>
            <select
              value={filters.asin}
              onChange={(e) => setFilters((f) => ({ ...f, asin: e.target.value }))}
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
              onChange={(e) => setFilters((f) => ({ ...f, productName: e.target.value }))}
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
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
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
            <label>Pack Size</label>
            <select
              value={filters.packSize}
              onChange={(e) => setFilters((f) => ({ ...f, packSize: e.target.value }))}
            >
              <option value="">All</option>
              {packSizeOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
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
        <h3>Key Buybox Metrics</h3>
        <div className="kpi-grid revenue-kpi-grid">
          <div className="kpi-item kpi-green">
            <div className="label">Overall Buybox %</div>
            <div className="value">{summary.overallBuyboxPct}%</div>
          </div>
          <div className="kpi-item kpi-amber">
            <div className="label">No. of SKUs with no Buybox</div>
            <div className="value">{summary.noBuyboxSkus}</div>
          </div>
          <div className="kpi-item kpi-blue">
            <div className="label">Actions Recommended</div>
            <div className="value">48</div>
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
              {filteredRows.map((row) => (
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
      </div>
    </>
  );
}
