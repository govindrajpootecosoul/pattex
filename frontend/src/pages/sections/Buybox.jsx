import { useEffect, useMemo, useRef, useState } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';
import { formatDateDDMonYY } from '../../utils/dateFormat';
import { useSalesChannels } from '../../hooks/useSalesChannels';

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

const BUYBOX_COLUMN_OPTIONS = [
  { id: 'brand', label: 'Brand' },
  { id: 'asin', label: 'ASIN' },
  { id: 'productName', label: 'Product Name' },
  { id: 'productCategory', label: 'Product Category' },
  { id: 'packType', label: 'Pack Type' },
  { id: 'packSize', label: 'Pack Size' },
  { id: 'totalSales', label: 'Last 30 Days Sales' },
  { id: 'totalSale', label: 'Total Sale' },
  { id: 'vcAvailableInventory', label: 'VC Available Inventory' },
  { id: 'scAvailableInventory', label: 'SC Available Inventory' },
  { id: 'openPOs', label: 'Open POs' },
  { id: 'dos', label: 'DOS' },
  { id: 'scIdealPrice', label: 'SC Ideal Price' },
  { id: 'vcIdealPrice', label: 'VC Ideal Price' },
  { id: 'currentOwner', label: 'Current Owner' },
  { id: 'currentOwnerPrice', label: 'Current Owner Price' },
  { id: 'hijacker1', label: 'Hijacker 1' },
  { id: 'hijacker1Price', label: 'Hijacker 1 Price' },
  { id: 'hijacker1MOQ', label: 'Hijacker 1 MOQ' },
  { id: 'hijacker2', label: 'Hijacker 2' },
  { id: 'hijacker2Price', label: 'Hijacker 2 Price' },
  { id: 'hijacker2MOQ', label: 'Hijacker 2 MOQ' },
  { id: 'hijacker3Price', label: 'Hijacker 3 Price' },
  { id: 'hijacker3', label: 'Hijacker 3' },

  // Remaining columns (appended after Hijacker 3)
  { id: 'productSubCategory', label: 'Product Sub Category' },
  { id: 'vendorConfirmationPct', label: 'Vendor Confirmation %' },
  { id: 'poReceivedAmount', label: 'PO_received_amount' },
  { id: 'poReceivedUnits', label: 'PO_received_Units' },
  { id: 'receiveFillRate', label: 'Receive_Fill_Rate' },
  { id: 'overallVendorLeadTimeDays', label: 'Overall Vendor Lead Time (days)' },
  { id: 'aged90PlusSellableInventory', label: 'Aged 90+ Days Sellable Inventory' },
  { id: 'aged90PlusSellableUnits', label: 'Aged 90+ Days Sellable Units' },
  { id: 'sellableInventoryAmount', label: 'Sellable Inventory Amount' },
  { id: 'availableInventory', label: 'Available Inventory' },
  { id: 'unsellableOnHandInventoryAmount', label: 'Unsellable On Hand Inventory Amount' },
  { id: 'unsellableOnHandUnits', label: 'Unsellable On Hand Units' },
  { id: 'reportDate', label: 'Date' },
  { id: 'salesChannel', label: 'Sales Channel' },
  { id: 'inStockFlag', label: 'in_stock_flag' },
  { id: 'cumulativeInstockDays', label: 'cumulative_instock_days' },
  { id: 'dayOfMonth', label: 'day_of_month' },
  { id: 'instockRate', label: 'Instock Rate' },
  { id: 'oosDate', label: 'OOS Date' },
  { id: 'totalUnits', label: 'total_units' },
  { id: 'sellThrough', label: 'sell_through' },
  { id: 'minAvailableQty', label: 'min_available_qty' },
  { id: 'maxAvailableQty', label: 'max_available_qty' },
  { id: 'stockStatus', label: 'Stock_Status' },
  { id: 'noLowStockWtOpenPOs', label: 'No/Low Stock wt Open POs' },
  { id: 'noLowStockWtNoOpenPOs', label: 'No/Low Stock wt no Open POs' },
  { id: 'hijacker3MOQ', label: 'Hijacker 3 MOQ' },
  { id: 'currentOwnerMOQ', label: 'Current Owner MOQ' },
];

const BUYBOX_COLUMN_ORDER_STORAGE_KEY = 'pattex.buybox.columnOrder.v1';
const BUYBOX_VISIBLE_COLUMNS_STORAGE_KEY = 'pattex.buybox.visibleColumns.v1';

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

function truncateText(value, maxChars) {
  const s = value == null ? '' : String(value);
  if (!maxChars || maxChars <= 0) return s;
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...`;
}

function csvEscape(field) {
  const s = field == null ? '' : String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const parseNumLoose = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (!s) return 0;
  // Keep digits, dot, and minus. This handles values like "1,234", "AED 1,234", etc.
  const cleaned = s.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const pick = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
};

function getRowProductCategory(row) {
  if (!row) return '';
  return (
    row.productCategory ??
    row.product_category ??
    row.category ??
    row['Product Category'] ??
    row['Product Sub Category'] ??
    row.productSubCategory ??
    ''
  );
}

/** Collapse duplicate ASINs: sum inventory/sales/units and additive metrics; average DOS, rates, ideal prices; last row wins for Current Owner. */
function mergeBuyboxRowsByAsin(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sumPick = (group, keys) =>
    group.reduce((s, r) => s + parseNumLoose(pick(r, keys)), 0);

  const avgPickInt = (group, keys) => {
    const n = group.length;
    if (!n) return 0;
    return Math.round(group.reduce((s, r) => s + parseNumLoose(pick(r, keys)), 0) / n);
  };

  const avgPickFloat = (group, keys) => {
    const n = group.length;
    if (!n) return 0;
    return Math.round((group.reduce((s, r) => s + parseNumLoose(pick(r, keys)), 0) / n) * 100) / 100;
  };

  const minPick = (group, keys) =>
    Math.min(...group.map((r) => parseNumLoose(pick(r, keys))));
  const maxPick = (group, keys) =>
    Math.max(...group.map((r) => parseNumLoose(pick(r, keys))));

  const withoutAsin = [];
  const byAsin = new Map();
  for (const row of rows) {
    const asin = String(row?.asin ?? '').trim();
    if (!asin) {
      withoutAsin.push(row);
      continue;
    }
    if (!byAsin.has(asin)) byAsin.set(asin, []);
    byAsin.get(asin).push(row);
  }

  const merged = [];
  for (const [asin, group] of byAsin) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const base = { ...group[0] };
    const last = group[group.length - 1];
    const owner =
      pick(last, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']) ?? last.currentBuyboxOwner ?? '';

    const sAvail = sumPick(group, ['Available Inventory', 'availableInventory']);
    const sTotalSales = sumPick(group, ['totalSales', 'total_sales']);
    const sTotalUnits = sumPick(group, ['totalUnits', 'total_units']);
    const sOpen = sumPick(group, ['Open POs', 'openPOs', 'openPos']);
    const sVc = sumPick(group, ['VC Available Inventory', 'vcAvailableInventory', 'vc_available_inventory']);
    const sSc = sumPick(group, ['SC Available Inventory', 'scAvailableInventory', 'sc_available_inventory']);
    const sAged90Amt = sumPick(group, ['Aged 90+ Days Sellable Inventory', 'aged90PlusSellableInventory']);
    const sAged90Units = sumPick(group, ['Aged 90+ Days Sellable Units', 'aged90PlusSellableUnits']);
    const sSellable = sumPick(group, ['Sellable Inventory Amount', 'sellableInventoryAmount']);
    const sUnsellAmt = sumPick(group, ['Unsellable On Hand Inventory Amount', 'unsellableOnHandInventoryAmount']);
    const sUnsellUnits = sumPick(group, ['Unsellable On Hand Units', 'unsellableOnHandUnits']);
    const sPoAmt = sumPick(group, ['PO_received_amount', 'poReceivedAmount']);
    const sPoUnits = sumPick(group, ['PO_received_Units', 'poReceivedUnits']);

    const dos = avgPickInt(group, ['DOS', 'dos']);
    const instockRate = avgPickInt(group, ['Instock Rate', 'instockRate']);
    const sellThrough = avgPickFloat(group, ['sell_through', 'sellThrough']);
    const cumInstock = avgPickInt(group, ['cumulative_instock_days', 'cumulativeInstockDays']);
    const vendorConf = avgPickFloat(group, ['Vendor Confirmation %', 'vendorConfirmationPct']);
    const recvFill = avgPickFloat(group, ['Receive_Fill_Rate', 'receiveFillRate']);
    const leadDays = avgPickFloat(group, ['Overall Vendor Lead Time (days)', 'overallVendorLeadTimeDays']);

    const scIdeal = avgPickFloat(group, ['SC Ideal Price', 'scIdealPrice']);
    const vcIdeal = avgPickFloat(group, ['VC Ideal Price', 'vcIdealPrice']);
    const ownerPrice = avgPickFloat(group, ['Current Owner Price', 'currentOwnerPrice', 'currentBuyboxPrice']);

    const minQ = minPick(group, ['min_available_qty', 'minAvailableQty']);
    const maxQ = maxPick(group, ['max_available_qty', 'maxAvailableQty']);

    const lowOpen = Math.max(
      ...group.map((r) => parseNumLoose(pick(r, ['No/Low Stock wt Open POs', 'noLowStockWtOpenPOs']))),
    );
    const lowNoOpen = Math.max(
      ...group.map((r) => parseNumLoose(pick(r, ['No/Low Stock wt no Open POs', 'noLowStockWtNoOpenPOs']))),
    );

    Object.assign(base, {
      id: `merged-${asin}`,
      _id: `merged-${asin}`,
      asin,
      availableInventory: sAvail,
      last30DaysSales: sTotalSales,
      totalSales: sTotalSales,
      totalUnits: sTotalUnits,
      openPos: sOpen,
      openPOs: sOpen,
      dos,
      instockRate,
      sellThrough,
      cumulativeInstockDays: cumInstock,
      aged90Amount: sAged90Amt,
      aged90Units: sAged90Units,
      sellableInventoryAmount: sSellable,
      unsellableOnHandAmount: sUnsellAmt,
      unsellableOnHandUnits: sUnsellUnits,
      minAvailableQty: minQ,
      maxAvailableQty: maxQ,
      currentBuyboxOwner: owner,
      currentBuyboxPrice: ownerPrice,
      currentScPrice: scIdeal,
      currentVcPrice: vcIdeal,
      'Available Inventory': sAvail,
      total_sales: sTotalSales,
      total_units: sTotalUnits,
      'Open POs': sOpen,
      DOS: dos,
      'Instock Rate': instockRate,
      sell_through: sellThrough,
      cumulative_instock_days: cumInstock,
      'Aged 90+ Days Sellable Inventory': sAged90Amt,
      'Aged 90+ Days Sellable Units': sAged90Units,
      'Sellable Inventory Amount': sSellable,
      'Unsellable On Hand Inventory Amount': sUnsellAmt,
      'Unsellable On Hand Units': sUnsellUnits,
      PO_received_amount: sPoAmt,
      PO_received_Units: sPoUnits,
      'Vendor Confirmation %': vendorConf,
      Receive_Fill_Rate: recvFill,
      'Overall Vendor Lead Time (days)': leadDays,
      'SC Ideal Price': scIdeal,
      'VC Ideal Price': vcIdeal,
      'Current Owner': owner,
      'Current Owner Price': ownerPrice,
      min_available_qty: minQ,
      max_available_qty: maxQ,
      'No/Low Stock wt Open POs': lowOpen,
      'No/Low Stock wt no Open POs': lowNoOpen,
      vcAvailableInventory: sVc,
      scAvailableInventory: sSc,
      'VC Available Inventory': sVc,
      'SC Available Inventory': sSc,
    });

    for (let i = 1; i <= 10; i += 1) {
      const hp = avgPickFloat(group, [`Hijacker ${i} Price`, `hijacker${i}Price`]);
      const hm = avgPickFloat(group, [`Hijacker ${i} MOQ`, `hijacker${i}MOQ`]);
      base[`Hijacker ${i} Price`] = hp;
      base[`hijacker${i}Price`] = hp;
      base[`Hijacker ${i} MOQ`] = hm;
      base[`hijacker${i}MOQ`] = hm;
    }

    const inStockMax = Math.max(
      ...group.map((r) => parseNumLoose(pick(r, ['in_stock_flag', 'inStockFlag']))),
    );
    base.inStockFlag = inStockMax;
    base.in_stock_flag = inStockMax;

    merged.push(base);
  }

  return [...merged, ...withoutAsin];
}

export default function Buybox() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'productName', dir: 'asc' }); // default: Product Name A-Z
  // Key Buybox Metrics should reflect currently applied UI filters,
  // so we compute them client-side from filtered rows (not from API summary).
  const [filters, setFilters] = useState({
    search: '',
    asin: '',
    productName: '',
    category: '',
    packSize: '',
    channel: 'Seller Central',
  });
  const [stockFilter, setStockFilter] = useState('ALL_SKUS');
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isSellerCentralSelected = useMemo(() => {
    const s = String(filters.channel || '').trim().toLowerCase();
    return s === 'seller central' || s.includes('seller central');
  }, [filters.channel]);
  const maxSelectableDateStr = useMemo(() => {
    // Seller Central can select "today"; other channels keep the T-3 guard.
    if (isSellerCentralSelected) return todayStr;
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().split('T')[0];
  }, [isSellerCentralSelected, todayStr]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [previousDayRows, setPreviousDayRows] = useState([]);
  const [last30SalesByAsinMap, setLast30SalesByAsinMap] = useState(() => new Map());
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const defaults = {
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
      totalSale: true,
      vcAvailableInventory: true,
      scAvailableInventory: true,
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
    };

    try {
      const raw = localStorage.getItem(BUYBOX_VISIBLE_COLUMNS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const next = { ...defaults };
        Object.keys(next).forEach((k) => {
          if (typeof parsed[k] === 'boolean') next[k] = parsed[k];
        });
        return next;
      }
    } catch {
      // ignore storage issues and fallback to defaults
    }

    return defaults;
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const selectAllColumnsRef = useRef(null);
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(BUYBOX_COLUMN_ORDER_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
        const known = BUYBOX_COLUMN_OPTIONS.map((c) => c.id);
        const base = parsed.filter((id) => known.includes(id));
        // Ensure newly added columns are still draggable (append missing).
        known.forEach((id) => {
          if (!base.includes(id)) base.push(id);
        });
        return base;
      }
    } catch {
      // ignore storage issues and fallback to default order
    }
    return BUYBOX_COLUMN_OPTIONS.map((c) => c.id);
  });
  const dragColumnIdRef = useRef(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [csvExportError, setCsvExportError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [latestUpdatedAtByChannel, setLatestUpdatedAtByChannel] = useState(null);
  const [salesChannelOptionsFromApi, setSalesChannelOptionsFromApi] = useState([]);
  const allSalesChannels = useSalesChannels();
  const [asinListModal, setAsinListModal] = useState(null); // null | 'with_buybox' | 'no_buybox'

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = {};
    const channel = filters.channel ? String(filters.channel).trim() : '';
    if (selectedDate) {
      // Keep the main Buybox payload fast by fetching only the selected day.
      params.customRangeStart = selectedDate;
      params.customRangeEnd = selectedDate;
    }
    if (channel) params.salesChannel = channel;
    dashboardApi
      .getBuybox(params)
      .then((data) => {
        const apiRows = Array.isArray(data.rows) ? data.rows : [];
        setRows(apiRows);
        setPreviousDayRows(Array.isArray(data.previousDayRows) ? data.previousDayRows : []);
        setUpdatedAt(data?.updatedAt ?? null);
        setSalesChannelOptionsFromApi(Array.isArray(data.salesChannelOptions) ? data.salesChannelOptions : []);
      })
      .catch((e) => {
        setError(e.message);
        setPreviousDayRows([]);
      })
      .finally(() => setLoading(false));
  }, [selectedDate, filters.channel]);

  useEffect(() => {
    if (!selectedDate) return;
    const end = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(end.getTime())) return;
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    const channel = filters.channel ? String(filters.channel).trim() : '';

    dashboardApi
      .getBuyboxLast30Sales({
        customRangeStart: start.toISOString().slice(0, 10),
        customRangeEnd: selectedDate,
        ...(channel ? { salesChannel: channel } : {}),
      })
      .then((resp) => {
        const obj = resp?.last30SalesByAsin || {};
        const m = new Map();
        Object.keys(obj).forEach((k) => {
          if (!k) return;
          m.set(k, parseNumLoose(obj[k]));
        });
        setLast30SalesByAsinMap(m);
      })
      .catch(() => {
        setLast30SalesByAsinMap(new Map());
      });
  }, [selectedDate, filters.channel]);

  useEffect(() => {
    let cancelled = false;
    const channel = filters.channel ? String(filters.channel).trim() : '';
    dashboardApi
      .getLatestUpdatedDate({ dataset: 'buybox', salesChannel: channel })
      .then((resp) => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(resp?.updatedAt ?? null);
        const dateKey = resp?.dateKey ? String(resp.dateKey).slice(0, 10) : '';
        if (dateKey && dateKey !== selectedDate) {
          setSelectedDate(dateKey);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(null);
      });
    return () => { cancelled = true; };
  }, [filters.channel]); // intentionally not depending on selectedDate to avoid loops

  // If channel changes to one with a stricter max, clamp the selected date.
  useEffect(() => {
    if (!selectedDate || !maxSelectableDateStr) return;
    if (selectedDate > maxSelectableDateStr) {
      setSelectedDate(maxSelectableDateStr);
    }
  }, [maxSelectableDateStr]);

  const rowsForSelectedDate = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter((row) => normalizeReportDate(row.reportDate) === selectedDate);
  }, [rows, selectedDate]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(rowsForSelectedDate.map(getRowProductCategory).filter(Boolean))),
    [rowsForSelectedDate],
  );

  const rowsForProductNames = useMemo(
    () =>
      filters.category
        ? rowsForSelectedDate.filter((r) => getRowProductCategory(r) === filters.category)
        : rowsForSelectedDate,
    [rowsForSelectedDate, filters.category],
  );

  const productNameOptions = useMemo(
    () => Array.from(new Set(rowsForProductNames.map((r) => r.productName).filter(Boolean))),
    [rowsForProductNames],
  );

  const rowsForAsins = useMemo(
    () =>
      filters.productName
        ? rowsForProductNames.filter((r) => r.productName === filters.productName)
        : rowsForProductNames,
    [rowsForProductNames, filters.productName],
  );

  const asinOptions = useMemo(
    () => Array.from(new Set(rowsForAsins.map((r) => r.asin).filter(Boolean))),
    [rowsForAsins],
  );

  const packSizeOptions = useMemo(
    () =>
      Array.from(new Set(rowsForProductNames.map((r) => r.packSize).filter(Boolean))).sort((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    [rowsForProductNames],
  );
  // Use API-provided list (all unique Sales Channels in DB) when available; else derive from current rows
  const channelOptions = useMemo(() => {
    if (allSalesChannels.length > 0) return allSalesChannels;
    if (salesChannelOptionsFromApi.length > 0) {
      return salesChannelOptionsFromApi;
    }
    const seen = new Map();
    rows.forEach((r) => {
      const val = String(r.salesChannel || r.channel || r['Sales Channel'] || '').trim();
      if (val && !seen.has(val.toLowerCase())) seen.set(val.toLowerCase(), val);
    });
    return Array.from(seen.values()).sort((a, b) => String(a).localeCompare(String(b)));
  }, [allSalesChannels, rows, salesChannelOptionsFromApi]);

  // Ensure the selected channel matches an available option on first render/load.
  useEffect(() => {
    if (!channelOptions || channelOptions.length === 0) return;
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const current = normalize(filters.channel);
    const optionsNormalized = channelOptions.map((c) => ({ raw: c, key: normalize(c) }));
    const hasExact = current && optionsNormalized.some((o) => o.key === current);
    if (hasExact) return;
    const preferred = optionsNormalized.find((o) => o.key === 'seller central');
    const next = (preferred?.raw || optionsNormalized[0]?.raw || '').toString();
    if (next && next !== filters.channel) {
      setFilters((f) => ({ ...f, channel: next }));
      setPage(1);
    }
  }, [channelOptions]);

  const rowMatchesBuyboxFilters = useMemo(
    () => (row) => {
      if (filters.search) {
        const q = filters.search.trim().toLowerCase();
        if (q) {
          const searchable = [
            row.asin,
            row.productName,
            getRowProductCategory(row),
            row.packSize,
            row.channel,
            row.salesChannel,
            row['Sales Channel'],
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
      if (filters.category && getRowProductCategory(row) !== filters.category) return false;
      if (filters.packSize && row.packSize !== filters.packSize) return false;
      const channelValue = String(row.salesChannel || row.channel || row['Sales Channel'] || '').trim();
      if (filters.channel && channelValue.toLowerCase() !== filters.channel.toLowerCase()) return false;

      if (stockFilter === 'NO_BUYBOX' && isAmazonAeOwner(row.currentBuyboxOwner)) return false;

      return true;
    },
    [filters, stockFilter],
  );

  const filteredRows = useMemo(
    () => rowsForSelectedDate.filter(rowMatchesBuyboxFilters),
    [rowsForSelectedDate, rowMatchesBuyboxFilters],
  );

  const filteredPreviousDayRows = useMemo(
    () => previousDayRows.filter(rowMatchesBuyboxFilters),
    [previousDayRows, rowMatchesBuyboxFilters],
  );

  const aggregatedFilteredRows = useMemo(
    () => mergeBuyboxRowsByAsin(filteredRows),
    [filteredRows],
  );

  const aggregatedPreviousDayRows = useMemo(
    () => mergeBuyboxRowsByAsin(filteredPreviousDayRows),
    [filteredPreviousDayRows],
  );

  const summaryComputed = useMemo(() => {
    if (!aggregatedFilteredRows.length) {
      return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    }
    const asinToOwner = new Map();
    aggregatedFilteredRows.forEach((r) => {
      if (r.asin) asinToOwner.set(r.asin, normalizeOwner(r.currentBuyboxOwner));
    });
    const uniqueAsins = [...asinToOwner.keys()];
    const totalAsins = uniqueAsins.length;
    if (!totalAsins) return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    const amazonAeCount = uniqueAsins.filter((asin) => (asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const noBuyboxSkus = uniqueAsins.filter((asin) => !(asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const overallBuyboxPct = Math.round((amazonAeCount / totalAsins) * 100);
    return { overallBuyboxPct, noBuyboxSkus, amazonAeCount };
  }, [aggregatedFilteredRows]);

  const summary = summaryComputed;

  const summaryPreviousDay = useMemo(() => {
    if (!aggregatedPreviousDayRows.length) {
      return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    }
    const asinToOwner = new Map();
    aggregatedPreviousDayRows.forEach((r) => {
      if (r.asin) asinToOwner.set(r.asin, normalizeOwner(r.currentBuyboxOwner));
    });
    const uniqueAsins = [...asinToOwner.keys()];
    const totalAsins = uniqueAsins.length;
    if (!totalAsins) return { overallBuyboxPct: 0, noBuyboxSkus: 0, amazonAeCount: 0 };
    const amazonAeCount = uniqueAsins.filter((asin) => (asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const noBuyboxSkus = uniqueAsins.filter((asin) => !(asinToOwner.get(asin) || '').includes('amazon.ae')).length;
    const overallBuyboxPct = Math.round((amazonAeCount / totalAsins) * 100);
    return { overallBuyboxPct, noBuyboxSkus, amazonAeCount };
  }, [aggregatedPreviousDayRows]);

  /** One row per ASIN for modal tables (matches aggregated table). */
  const asinListForModal = useMemo(() => {
    const withBuybox = [];
    const noBuybox = [];
    aggregatedFilteredRows.forEach((row) => {
      if (!row.asin) return;
      if (isAmazonAeOwner(row.currentBuyboxOwner)) withBuybox.push(row);
      else noBuybox.push(row);
    });
    return { withBuybox, noBuybox };
  }, [aggregatedFilteredRows]);

  const toggleColumn = (id) => {
    setVisibleColumns((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const columnDefsById = useMemo(() => {
    const defs = {};
    BUYBOX_COLUMN_OPTIONS.forEach((c) => { defs[c.id] = c; });
    return defs;
  }, []);

  const visibleOrderedColumnIds = useMemo(() => {
    // Keep order stable and include only known column IDs.
    const known = new Set(BUYBOX_COLUMN_OPTIONS.map((c) => c.id));
    const orderedKnown = columnOrder.filter((id) => known.has(id));
    const missing = BUYBOX_COLUMN_OPTIONS.map((c) => c.id).filter((id) => !orderedKnown.includes(id));
    return [...orderedKnown, ...missing];
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(BUYBOX_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      // ignore storage issues (e.g. privacy mode)
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(BUYBOX_VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      // ignore storage issues (e.g. privacy mode)
    }
  }, [visibleColumns]);

  const renderCellByColumnId = (id, row) => {
    switch (id) {
      case 'brand': return textOrZero(pick(row, ['Brand', 'brand']));
      case 'asin': return textOrZero(row.asin);
      case 'productName': {
        const raw = pick(row, ['Product Name', 'productName', 'product_name']);
        const full = raw == null ? '' : String(raw);
        const display = full ? truncateText(full, 30) : '0';
        return <span title={full} className="buybox-cell-ellipsis">{display}</span>;
      }
      case 'productCategory': {
        const raw = pick(row, ['Product Category', 'productCategory', 'product_category']);
        const full = raw == null ? '' : String(raw);
        const display = full ? full : '0';
        return <span title={full} className="buybox-cell-ellipsis">{display}</span>;
      }
      case 'packType': return textOrZero(pick(row, ['Pack Type', 'packType']));
      case 'packSize': return textOrZero(row.packSize);
      case 'totalSales': return formatAed(last30SalesByAsinMap.get(row.asin) || 0);
      case 'totalSale': return formatAed(pick(row, ['totalSales', 'total_sales']));
      case 'vcAvailableInventory': return textOrZero(pick(row, ['VC Available Inventory', 'vcAvailableInventory', 'vc_available_inventory']));
      case 'scAvailableInventory': return textOrZero(pick(row, ['SC Available Inventory', 'scAvailableInventory', 'sc_available_inventory']));
      case 'openPOs': return textOrZero(pick(row, ['Open POs', 'openPOs']));
      case 'dos': return textOrZero(pick(row, ['DOS', 'dos']));
      case 'scIdealPrice': return textOrZero(pick(row, ['SC Ideal Price', 'scIdealPrice']));
      case 'vcIdealPrice': return textOrZero(pick(row, ['VC Ideal Price', 'vcIdealPrice']));
      case 'currentOwner': return textOrZero(pick(row, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']));
      case 'currentOwnerPrice': return formatAed(pick(row, ['Current Owner Price', 'currentOwnerPrice', 'currentBuyboxPrice']));
      case 'hijacker1': return textOrZero(pick(row, ['Hijacker 1', 'hijacker1']));
      case 'hijacker1Price': return formatAed(pick(row, ['Hijacker 1 Price', 'hijacker1Price']));
      case 'hijacker1MOQ': return textOrZero(pick(row, ['Hijacker 1 MOQ', 'hijacker1MOQ']));
      case 'hijacker2': return textOrZero(pick(row, ['Hijacker 2', 'hijacker2']));
      case 'hijacker2Price': return formatAed(pick(row, ['Hijacker 2 Price', 'hijacker2Price']));
      case 'hijacker2MOQ': return textOrZero(pick(row, ['Hijacker 2 MOQ', 'hijacker2MOQ']));
      case 'hijacker3Price': return formatAed(pick(row, ['Hijacker 3 Price', 'hijacker3Price']));
      case 'hijacker3': return textOrZero(pick(row, ['Hijacker 3', 'hijacker3']));
      case 'productSubCategory': return textOrZero(pick(row, ['Product Sub Category', 'productSubCategory']));
      case 'vendorConfirmationPct': return percentOrZero(pick(row, ['Vendor Confirmation %', 'vendorConfirmationPct']));
      case 'poReceivedAmount': return formatAed(pick(row, ['PO_received_amount', 'poReceivedAmount']));
      case 'poReceivedUnits': return textOrZero(pick(row, ['PO_received_Units', 'poReceivedUnits']));
      case 'receiveFillRate': return percentOrZero(pick(row, ['Receive_Fill_Rate', 'receiveFillRate']));
      case 'overallVendorLeadTimeDays': return textOrZero(pick(row, ['Overall Vendor Lead Time (days)', 'overallVendorLeadTimeDays']));
      case 'aged90PlusSellableInventory': return textOrZero(pick(row, ['Aged 90+ Days Sellable Inventory', 'aged90PlusSellableInventory']));
      case 'aged90PlusSellableUnits': return textOrZero(pick(row, ['Aged 90+ Days Sellable Units', 'aged90PlusSellableUnits']));
      case 'sellableInventoryAmount': return formatAed(pick(row, ['Sellable Inventory Amount', 'sellableInventoryAmount']));
      case 'availableInventory': return textOrZero(pick(row, ['Available Inventory', 'availableInventory']));
      case 'unsellableOnHandInventoryAmount': return textOrZero(pick(row, ['Unsellable On Hand Inventory Amount', 'unsellableOnHandInventoryAmount']));
      case 'unsellableOnHandUnits': return textOrZero(pick(row, ['Unsellable On Hand Units', 'unsellableOnHandUnits']));
      case 'reportDate': {
        const v = pick(row, ['Date', 'reportDate']);
        const s = v == null ? '' : String(v);
        return s ? formatDateDDMonYY(s.slice(0, 10)) : '0';
      }
      case 'salesChannel': return textOrZero(pick(row, ['Sales Channel', 'salesChannel', 'channel']));
      case 'inStockFlag': return textOrZero(pick(row, ['in_stock_flag', 'inStockFlag']));
      case 'cumulativeInstockDays': return textOrZero(pick(row, ['cumulative_instock_days', 'cumulativeInstockDays']));
      case 'dayOfMonth': return textOrZero(pick(row, ['day_of_month', 'dayOfMonth']));
      case 'instockRate': return textOrZero(pick(row, ['Instock Rate', 'instockRate']));
      case 'oosDate': return textOrZero(pick(row, ['OOS Date', 'oosDate']));
      case 'totalUnits': return textOrZero(pick(row, ['total_units', 'totalUnits']));
      case 'sellThrough': return textOrZero(pick(row, ['sell_through', 'sellThrough']));
      case 'minAvailableQty': return textOrZero(pick(row, ['min_available_qty', 'minAvailableQty']));
      case 'maxAvailableQty': return textOrZero(pick(row, ['max_available_qty', 'maxAvailableQty']));
      case 'stockStatus': return textOrZero(pick(row, ['Stock_Status', 'stockStatus']));
      case 'noLowStockWtOpenPOs': return textOrZero(pick(row, ['No/Low Stock wt Open POs', 'noLowStockWtOpenPOs']));
      case 'noLowStockWtNoOpenPOs': return textOrZero(pick(row, ['No/Low Stock wt no Open POs', 'noLowStockWtNoOpenPOs']));
      case 'currentOwnerMOQ': return textOrZero(pick(row, ['Current Owner MOQ', 'currentOwnerMOQ', 'moq']));
      case 'hijacker3MOQ': return textOrZero(pick(row, ['Hijacker 3 MOQ', 'hijacker3MOQ']));
      default: return '0';
    }
  };

  /** Plain-string values for CSV — keep in sync with `renderCellByColumnId` */
  const formatBuyboxRowCsvValue = (id, row) => {
    switch (id) {
      case 'brand': return textOrZero(pick(row, ['Brand', 'brand']));
      case 'asin': return textOrZero(row.asin);
      case 'productName': {
        const raw = pick(row, ['Product Name', 'productName', 'product_name']);
        const full = raw == null ? '' : String(raw);
        return full ? full : '0';
      }
      case 'productCategory': {
        const raw = pick(row, ['Product Category', 'productCategory', 'product_category']);
        const full = raw == null ? '' : String(raw);
        return full ? full : '0';
      }
      case 'packType': return textOrZero(pick(row, ['Pack Type', 'packType']));
      case 'packSize': return textOrZero(row.packSize);
      case 'totalSales': return formatAed(last30SalesByAsinMap.get(row.asin) || 0);
      case 'totalSale': return formatAed(pick(row, ['totalSales', 'total_sales']));
      case 'vcAvailableInventory': return textOrZero(pick(row, ['VC Available Inventory', 'vcAvailableInventory', 'vc_available_inventory']));
      case 'scAvailableInventory': return textOrZero(pick(row, ['SC Available Inventory', 'scAvailableInventory', 'sc_available_inventory']));
      case 'openPOs': return textOrZero(pick(row, ['Open POs', 'openPOs']));
      case 'dos': return textOrZero(pick(row, ['DOS', 'dos']));
      case 'scIdealPrice': return textOrZero(pick(row, ['SC Ideal Price', 'scIdealPrice']));
      case 'vcIdealPrice': return textOrZero(pick(row, ['VC Ideal Price', 'vcIdealPrice']));
      case 'currentOwner': return textOrZero(pick(row, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']));
      case 'currentOwnerPrice': return formatAed(pick(row, ['Current Owner Price', 'currentOwnerPrice', 'currentBuyboxPrice']));
      case 'hijacker1': return textOrZero(pick(row, ['Hijacker 1', 'hijacker1']));
      case 'hijacker1Price': return formatAed(pick(row, ['Hijacker 1 Price', 'hijacker1Price']));
      case 'hijacker1MOQ': return textOrZero(pick(row, ['Hijacker 1 MOQ', 'hijacker1MOQ']));
      case 'hijacker2': return textOrZero(pick(row, ['Hijacker 2', 'hijacker2']));
      case 'hijacker2Price': return formatAed(pick(row, ['Hijacker 2 Price', 'hijacker2Price']));
      case 'hijacker2MOQ': return textOrZero(pick(row, ['Hijacker 2 MOQ', 'hijacker2MOQ']));
      case 'hijacker3Price': return formatAed(pick(row, ['Hijacker 3 Price', 'hijacker3Price']));
      case 'hijacker3': return textOrZero(pick(row, ['Hijacker 3', 'hijacker3']));
      case 'productSubCategory': return textOrZero(pick(row, ['Product Sub Category', 'productSubCategory']));
      case 'vendorConfirmationPct': return percentOrZero(pick(row, ['Vendor Confirmation %', 'vendorConfirmationPct']));
      case 'poReceivedAmount': return formatAed(pick(row, ['PO_received_amount', 'poReceivedAmount']));
      case 'poReceivedUnits': return textOrZero(pick(row, ['PO_received_Units', 'poReceivedUnits']));
      case 'receiveFillRate': return percentOrZero(pick(row, ['Receive_Fill_Rate', 'receiveFillRate']));
      case 'overallVendorLeadTimeDays': return textOrZero(pick(row, ['Overall Vendor Lead Time (days)', 'overallVendorLeadTimeDays']));
      case 'aged90PlusSellableInventory': return textOrZero(pick(row, ['Aged 90+ Days Sellable Inventory', 'aged90PlusSellableInventory']));
      case 'aged90PlusSellableUnits': return textOrZero(pick(row, ['Aged 90+ Days Sellable Units', 'aged90PlusSellableUnits']));
      case 'sellableInventoryAmount': return formatAed(pick(row, ['Sellable Inventory Amount', 'sellableInventoryAmount']));
      case 'availableInventory': return textOrZero(pick(row, ['Available Inventory', 'availableInventory']));
      case 'unsellableOnHandInventoryAmount': return textOrZero(pick(row, ['Unsellable On Hand Inventory Amount', 'unsellableOnHandInventoryAmount']));
      case 'unsellableOnHandUnits': return textOrZero(pick(row, ['Unsellable On Hand Units', 'unsellableOnHandUnits']));
      case 'reportDate': {
        const v = pick(row, ['Date', 'reportDate']);
        const s = v == null ? '' : String(v);
        return s ? formatDateDDMonYY(s.slice(0, 10)) : '0';
      }
      case 'salesChannel': return textOrZero(pick(row, ['Sales Channel', 'salesChannel', 'channel']));
      case 'inStockFlag': return textOrZero(pick(row, ['in_stock_flag', 'inStockFlag']));
      case 'cumulativeInstockDays': return textOrZero(pick(row, ['cumulative_instock_days', 'cumulativeInstockDays']));
      case 'dayOfMonth': return textOrZero(pick(row, ['day_of_month', 'dayOfMonth']));
      case 'instockRate': return textOrZero(pick(row, ['Instock Rate', 'instockRate']));
      case 'oosDate': return textOrZero(pick(row, ['OOS Date', 'oosDate']));
      case 'totalUnits': return textOrZero(pick(row, ['total_units', 'totalUnits']));
      case 'sellThrough': return textOrZero(pick(row, ['sell_through', 'sellThrough']));
      case 'minAvailableQty': return textOrZero(pick(row, ['min_available_qty', 'minAvailableQty']));
      case 'maxAvailableQty': return textOrZero(pick(row, ['max_available_qty', 'maxAvailableQty']));
      case 'stockStatus': return textOrZero(pick(row, ['Stock_Status', 'stockStatus']));
      case 'noLowStockWtOpenPOs': return textOrZero(pick(row, ['No/Low Stock wt Open POs', 'noLowStockWtOpenPOs']));
      case 'noLowStockWtNoOpenPOs': return textOrZero(pick(row, ['No/Low Stock wt no Open POs', 'noLowStockWtNoOpenPOs']));
      case 'currentOwnerMOQ': return textOrZero(pick(row, ['Current Owner MOQ', 'currentOwnerMOQ', 'moq']));
      case 'hijacker3MOQ': return textOrZero(pick(row, ['Hijacker 3 MOQ', 'hijacker3MOQ']));
      default: return '0';
    }
  };

  const downloadDetailedBuyboxCsv = () => {
    setCsvExportError('');
    setCsvDownloading(true);
    try {
      const activeCols = visibleOrderedColumnIds.filter((id) => visibleColumns[id]);
      if (activeCols.length === 0) {
        setCsvExportError('Select at least one column to export.');
        return;
      }
      const header = activeCols.map((colId) => csvEscape(columnDefsById[colId]?.label || colId)).join(',');
      const lines = [header];
      for (const row of sortedRows) {
        lines.push(activeCols.map((colId) => csvEscape(formatBuyboxRowCsvValue(colId, row))).join(','));
      }
      const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeStock = String(stockFilter || 'ALL').replace(/[^a-z0-9_-]/gi, '_');
      a.download = `buybox-detailed-${safeStock}-${selectedDate || 'date'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCsvExportError(e?.message || 'Could not download CSV.');
    } finally {
      setCsvDownloading(false);
    }
  };

  const allColumnsSelected = useMemo(
    () => BUYBOX_COLUMN_OPTIONS.every((c) => !!visibleColumns[c.id]),
    [visibleColumns],
  );
  const someColumnsSelected = useMemo(
    () => BUYBOX_COLUMN_OPTIONS.some((c) => !!visibleColumns[c.id]),
    [visibleColumns],
  );

  useEffect(() => {
    if (!selectAllColumnsRef.current) return;
    selectAllColumnsRef.current.indeterminate = someColumnsSelected && !allColumnsSelected;
  }, [someColumnsSelected, allColumnsSelected]);

  const toggleAllColumns = () => {
    setVisibleColumns((prev) => {
      const shouldEnableAll = !BUYBOX_COLUMN_OPTIONS.every((c) => !!prev[c.id]);
      const next = { ...prev };
      BUYBOX_COLUMN_OPTIONS.forEach((c) => {
        next[c.id] = shouldEnableAll;
      });
      return next;
    });
  };

  const onColumnDragStart = (id) => {
    dragColumnIdRef.current = id;
  };
  const onColumnDrop = (targetId) => {
    const sourceId = dragColumnIdRef.current;
    dragColumnIdRef.current = null;
    if (!sourceId || sourceId === targetId) return;
    setColumnOrder((prev) => {
      const known = BUYBOX_COLUMN_OPTIONS.map((c) => c.id);
      // Always operate on a full order list (includes newly added columns).
      const base = [...new Set([...(Array.isArray(prev) ? prev : []).filter((id) => known.includes(id)), ...known])];
      const from = base.indexOf(sourceId);
      const to = base.indexOf(targetId);
      if (from === -1 || to === -1) return base;
      base.splice(from, 1);
      base.splice(to, 0, sourceId);
      return base;
    });
  };

  const clearAllFilters = () => {
    setFilters({
      search: '',
      asin: '',
      productName: '',
      category: '',
      packSize: '',
      channel: 'Seller Central',
    });
    setStockFilter('ALL_SKUS');
    setSelectedDate(maxSelectableDateStr);
  };

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      category: value,
      productName: '',
      asin: '',
      packSize: '',
    }));
    setPage(1);
  };

  const handleProductNameChange = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      productName: value,
      asin: '',
      packSize: '',
    }));
    setPage(1);
  };

  const handleAsinChange = (e) => {
    setFilters((prev) => ({ ...prev, asin: e.target.value }));
    setPage(1);
  };

  const hasFiltersToClear =
    selectedDate !== maxSelectableDateStr ||
    (filters.search && filters.search.trim()) ||
    filters.asin ||
    filters.productName ||
    filters.category ||
    filters.packSize ||
    filters.channel !== 'Seller Central' ||
    stockFilter !== 'ALL_SKUS';

  const kpiTrends = useMemo(() => {
    const fallback = { value: '—', type: 'neutral' };
    const fmt = (pct) => {
      if (pct == null || Number.isNaN(pct)) return '—';
      if (pct >= 0) return `↑${pct}%`;
      return `↓${Math.abs(pct)}%`;
    };
    const type = (pct) => (pct == null || Number.isNaN(pct) ? 'neutral' : pct < 0 ? 'negative' : pct > 0 ? 'positive' : 'neutral');
    const pctChange = (current, previous) => {
      if (previous === 0 || previous == null || Number.isNaN(previous)) return null;
      if (current == null || Number.isNaN(current)) return null;
      return ((current - previous) / previous) * 100;
    };
    const rounded = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);

    const makeTrend = (pctVal, currentValue) => {
      if (!currentValue) return fallback;
      if (pctVal == null || Number.isNaN(pctVal)) return fallback;
      return { value: fmt(rounded(pctVal)), type: type(pctVal) };
    };

    const prev = summaryPreviousDay;
    return {
      overallBuyboxPct: makeTrend(pctChange(summary.overallBuyboxPct, prev.overallBuyboxPct), summary.overallBuyboxPct),
      noBuyboxSkus: makeTrend(pctChange(summary.noBuyboxSkus, prev.noBuyboxSkus), summary.noBuyboxSkus),
      amazonAeCount: makeTrend(pctChange(summary.amazonAeCount, prev.amazonAeCount), summary.amazonAeCount),
    };
  }, [
    summary.overallBuyboxPct,
    summary.noBuyboxSkus,
    summary.amazonAeCount,
    summaryPreviousDay.overallBuyboxPct,
    summaryPreviousDay.noBuyboxSkus,
    summaryPreviousDay.amazonAeCount,
  ]);

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
          <div className="table-wrap buybox-table-wrap">
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

  const sortedRows = useMemo(() => {
    const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
    const rawKey = sort?.key || 'productName';
    const key = rawKey === 'brand' || rawKey === 'asin' ? 'productName' : rawKey;

    const getCellValue = (row) => {
      switch (key) {
        case 'productName':
          return String(pick(row, ['Product Name', 'productName', 'product_name']) ?? '');
        case 'productCategory':
          return String(pick(row, ['Product Category', 'productCategory', 'product_category']) ?? '');
        case 'packType':
          return String(pick(row, ['Pack Type', 'packType']) ?? '');
        case 'packSize':
          return row?.packSize ?? '';
        case 'totalSales':
          return Number(last30SalesByAsinMap.get(row?.asin) ?? 0);
        case 'totalSale':
          return parseNumLoose(pick(row, ['totalSales', 'total_sales']));
        case 'vcAvailableInventory':
          return parseNumLoose(pick(row, ['VC Available Inventory', 'vcAvailableInventory', 'vc_available_inventory']));
        case 'scAvailableInventory':
          return parseNumLoose(pick(row, ['SC Available Inventory', 'scAvailableInventory', 'sc_available_inventory']));
        case 'openPOs':
          return parseNumLoose(pick(row, ['Open POs', 'openPOs']));
        case 'dos':
          return parseNumLoose(pick(row, ['DOS', 'dos']));
        case 'scIdealPrice':
          return parseNumLoose(pick(row, ['SC Ideal Price', 'scIdealPrice']));
        case 'vcIdealPrice':
          return parseNumLoose(pick(row, ['VC Ideal Price', 'vcIdealPrice']));
        case 'currentOwner':
          return String(pick(row, ['Current Owner', 'currentOwner', 'currentBuyboxOwner']) ?? '');
        case 'currentOwnerPrice':
          return parseNumLoose(pick(row, ['Current Owner Price', 'currentOwnerPrice', 'currentBuyboxPrice']));
        case 'currentOwnerMOQ':
          return parseNumLoose(pick(row, ['Current Owner MOQ', 'currentOwnerMOQ', 'moq']));
        case 'hijacker1':
          return String(pick(row, ['Hijacker 1', 'hijacker1']) ?? '');
        case 'hijacker2':
          return String(pick(row, ['Hijacker 2', 'hijacker2']) ?? '');
        case 'hijacker3':
          return String(pick(row, ['Hijacker 3', 'hijacker3']) ?? '');
        case 'hijacker1Price':
          return parseNumLoose(pick(row, ['Hijacker 1 Price', 'hijacker1Price']));
        case 'hijacker2Price':
          return parseNumLoose(pick(row, ['Hijacker 2 Price', 'hijacker2Price']));
        case 'hijacker3Price':
          return parseNumLoose(pick(row, ['Hijacker 3 Price', 'hijacker3Price']));
        case 'hijacker1MOQ':
          return parseNumLoose(pick(row, ['Hijacker 1 MOQ', 'hijacker1MOQ']));
        case 'hijacker2MOQ':
          return parseNumLoose(pick(row, ['Hijacker 2 MOQ', 'hijacker2MOQ']));
        case 'hijacker3MOQ':
          return parseNumLoose(pick(row, ['Hijacker 3 MOQ', 'hijacker3MOQ']));
        case 'productSubCategory':
          return String(pick(row, ['Product Sub Category', 'productSubCategory']) ?? '');
        case 'vendorConfirmationPct':
          return parseNumLoose(pick(row, ['Vendor Confirmation %', 'vendorConfirmationPct']));
        case 'poReceivedAmount':
          return parseNumLoose(pick(row, ['PO_received_amount', 'poReceivedAmount']));
        case 'poReceivedUnits':
          return parseNumLoose(pick(row, ['PO_received_Units', 'poReceivedUnits']));
        case 'receiveFillRate':
          return parseNumLoose(pick(row, ['Receive_Fill_Rate', 'receiveFillRate']));
        case 'overallVendorLeadTimeDays':
          return parseNumLoose(pick(row, ['Overall Vendor Lead Time (days)', 'overallVendorLeadTimeDays']));
        case 'aged90PlusSellableInventory':
          return parseNumLoose(pick(row, ['Aged 90+ Days Sellable Inventory', 'aged90PlusSellableInventory']));
        case 'aged90PlusSellableUnits':
          return parseNumLoose(pick(row, ['Aged 90+ Days Sellable Units', 'aged90PlusSellableUnits']));
        case 'sellableInventoryAmount':
          return parseNumLoose(pick(row, ['Sellable Inventory Amount', 'sellableInventoryAmount']));
        case 'availableInventory':
          return parseNumLoose(pick(row, ['Available Inventory', 'availableInventory']));
        case 'unsellableOnHandInventoryAmount':
          return parseNumLoose(pick(row, ['Unsellable On Hand Inventory Amount', 'unsellableOnHandInventoryAmount']));
        case 'unsellableOnHandUnits':
          return parseNumLoose(pick(row, ['Unsellable On Hand Units', 'unsellableOnHandUnits']));
        case 'reportDate':
          return normalizeReportDate(pick(row, ['Date', 'reportDate']));
        case 'salesChannel':
          return String(pick(row, ['Sales Channel', 'salesChannel', 'channel']) ?? '');
        case 'inStockFlag':
          return parseNumLoose(pick(row, ['in_stock_flag', 'inStockFlag']));
        case 'cumulativeInstockDays':
          return parseNumLoose(pick(row, ['cumulative_instock_days', 'cumulativeInstockDays']));
        case 'dayOfMonth':
          return parseNumLoose(pick(row, ['day_of_month', 'dayOfMonth']));
        case 'instockRate':
          return parseNumLoose(pick(row, ['Instock Rate', 'instockRate']));
        case 'oosDate':
          return normalizeReportDate(pick(row, ['OOS Date', 'oosDate']));
        case 'totalUnits':
          return parseNumLoose(pick(row, ['total_units', 'totalUnits']));
        case 'sellThrough':
          return parseNumLoose(pick(row, ['sell_through', 'sellThrough']));
        case 'minAvailableQty':
          return parseNumLoose(pick(row, ['min_available_qty', 'minAvailableQty']));
        case 'maxAvailableQty':
          return parseNumLoose(pick(row, ['max_available_qty', 'maxAvailableQty']));
        case 'stockStatus':
          return String(pick(row, ['Stock_Status', 'stockStatus']) ?? '');
        case 'noLowStockWtOpenPOs':
          return parseNumLoose(pick(row, ['No/Low Stock wt Open POs', 'noLowStockWtOpenPOs']));
        case 'noLowStockWtNoOpenPOs':
          return parseNumLoose(pick(row, ['No/Low Stock wt no Open POs', 'noLowStockWtNoOpenPOs']));
        case 'asin':
          return String(row?.asin ?? '');
        case 'brand':
          return String(pick(row, ['Brand', 'brand']) ?? '');
        default:
          return row?.[key];
      }
    };

    const numericKeys = new Set([
      'packSize',
      'totalSales',
      'totalSale',
      'vcAvailableInventory',
      'scAvailableInventory',
      'openPOs',
      'dos',
      'scIdealPrice',
      'vcIdealPrice',
      'currentOwnerPrice',
      'currentOwnerMOQ',
      'hijacker1Price',
      'hijacker2Price',
      'hijacker3Price',
      'hijacker1MOQ',
      'hijacker2MOQ',
      'hijacker3MOQ',
      'vendorConfirmationPct',
      'poReceivedAmount',
      'poReceivedUnits',
      'receiveFillRate',
      'overallVendorLeadTimeDays',
      'aged90PlusSellableInventory',
      'aged90PlusSellableUnits',
      'sellableInventoryAmount',
      'availableInventory',
      'unsellableOnHandInventoryAmount',
      'unsellableOnHandUnits',
      'inStockFlag',
      'cumulativeInstockDays',
      'dayOfMonth',
      'instockRate',
      'totalUnits',
      'sellThrough',
      'minAvailableQty',
      'maxAvailableQty',
      'noLowStockWtOpenPOs',
      'noLowStockWtNoOpenPOs',
    ]);

    const compare = (a, b) => {
      const av = getCellValue(a);
      const bv = getCellValue(b);
      const aEmpty = av == null || av === '' || (typeof av === 'number' && Number.isNaN(av));
      const bEmpty = bv == null || bv === '' || (typeof bv === 'number' && Number.isNaN(bv));
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (numericKeys.has(key)) {
        const an = typeof av === 'number' ? av : parseNumLoose(av);
        const bn = typeof bv === 'number' ? bv : parseNumLoose(bv);
        if (an === bn) return 0;
        return an < bn ? -1 : 1;
      }

      if (key === 'reportDate' || key === 'oosDate') {
        const as = String(av);
        const bs = String(bv);
        if (as === bs) return 0;
        return as < bs ? -1 : 1;
      }

      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
    };

    const base = [...aggregatedFilteredRows];
    base.sort((a, b) => {
      const c = compare(a, b);
      return dir === 'desc' ? -c : c;
    });
    return base;
  }, [aggregatedFilteredRows, last30SalesByAsinMap, sort]);

  if (loading) return <div className="section-muted">Loading...</div>;
  if (error) return <div className="auth-error">{error}</div>;

  const totalRows = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRows = sortedRows.slice(startIndex, endIndex);

  const dataUpdatedDate = (latestUpdatedAtByChannel || updatedAt)
    ? String(latestUpdatedAtByChannel || updatedAt).split('T')[0]
    : null;
  const dataUpdatedDisplay = dataUpdatedDate ? formatDateDDMonYY(dataUpdatedDate) : null;

  return (
    <>
      <style>{`
        /* Buybox-only: keep table headers visible while scrolling rows */
        .table-wrap.buybox-table-wrap {
          position: relative;
          max-height: 65vh;
          overflow: auto;
        }

        .table-wrap.buybox-table-wrap table {
          border-collapse: separate;
          border-spacing: 0;
        }

        .table-wrap.buybox-table-wrap thead th {
          position: sticky;
          top: 0;
          z-index: 5;
          background: var(--card-bg, #fff);
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
        }

        /* Buybox-only: sortable header button */
        .buybox-table-wrap th .th-sort-btn {
          appearance: none;
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          width: 100%;
          text-align: left;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          cursor: pointer;
          color: inherit;
          font: inherit;
        }

        .buybox-table-wrap th .th-sort-icons {
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          line-height: 1;
          font-size: 0.75rem;
          gap: 2px;
          user-select: none;
        }

        .buybox-table-wrap th .th-sort-icons span {
          color: #9ca3af; /* grey for unselected */
          font-weight: 700;
        }

        .buybox-table-wrap th .th-sort-icons .active {
          color: #111827; /* black for active */
          font-weight: 900;
        }

        .buybox-table-wrap th.th-sort-active .th-sort-btn > span:first-child {
          color: var(--success, #16a34a);
        }

        /* Buybox table: keep Product Name/Category in one line */
        .buybox-col-product-name {
          min-width: 260px;
          width: 260px;
        }

        .buybox-col-product-category {
          min-width: 200px;
          width: 200px;
        }

        .buybox-cell-ellipsis {
          display: inline-block;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: bottom;
        }
      `}</style>
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
            <select value={filters.category} onChange={handleCategoryChange} aria-label="Product Category">
              <option value="">{filters.category ? 'Select All' : 'Product Category'}</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select value={filters.productName} onChange={handleProductNameChange} aria-label="Product Name">
              <option value="">{filters.productName ? 'Select All' : 'Product Name'}</option>
              {productNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <select value={filters.asin} onChange={handleAsinChange} aria-label="ASIN">
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
              value={filters.packSize}
              onChange={(e) => setFilters((f) => ({ ...f, packSize: e.target.value }))}
              aria-label="Pack Size"
            >
              <option value="">{filters.packSize ? 'Select All' : 'Pack Size'}</option>
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
            <div className="value-secondary">vs previous day</div>
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
            <div className="value-secondary">vs previous day</div>
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
            <div className="value-secondary">vs previous day</div>
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.35rem',
          }}
        >
          <h3 style={{ margin: 0 }}>Detailed Buybox View</h3>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn-primary-soft"
              onClick={downloadDetailedBuyboxCsv}
              disabled={loading || csvDownloading}
            >
              {csvDownloading ? 'Preparing…' : 'Download CSV'}
            </button>
            {csvExportError ? (
              <span className="section-muted" style={{ color: 'var(--danger, #c62828)', fontSize: '0.85rem' }}>
                {csvExportError}
              </span>
            ) : null}
          </div>
        </div>
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
                <label key="__select_all__" className="column-picker-item">
                  <input
                    ref={selectAllColumnsRef}
                    type="checkbox"
                    checked={allColumnsSelected}
                    onChange={toggleAllColumns}
                  />
                  Select all
                </label>
                <div style={{ margin: '6px 0 10px', fontSize: 12, opacity: 0.8 }}>
                  Drag a row to reorder columns.
                </div>
                {visibleOrderedColumnIds.map((id) => {
                  const col = columnDefsById[id];
                  if (!col) return null;
                  return (
                    <label
                      key={col.id}
                      className="column-picker-item"
                      draggable
                      onDragStart={() => onColumnDragStart(col.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onColumnDrop(col.id)}
                      style={{ cursor: 'grab' }}
                      title="Drag to reorder"
                    >
                      <input
                        type="checkbox"
                        checked={!!visibleColumns[col.id]}
                        onChange={() => toggleColumn(col.id)}
                      />
                      {col.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="table-wrap buybox-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {visibleOrderedColumnIds.map((id) => {
                  const def = columnDefsById[id];
                  if (!def) return null;
                  if (!visibleColumns[id]) return null;
                  const isSortable = id !== 'brand' && id !== 'asin';
                  const cls =
                    id === 'productName'
                      ? 'buybox-col-product-name'
                      : id === 'productCategory'
                        ? 'buybox-col-product-category'
                        : '';
                  if (!isSortable) return <th key={id} className={cls}>{def.label}</th>;
                  const isActive = sort?.key === id;
                  const ascActive = isActive && sort?.dir === 'asc';
                  const descActive = isActive && sort?.dir === 'desc';
                  const thCls = [cls, isActive ? 'th-sort-active' : ''].filter(Boolean).join(' ');
                  const onSort = () => {
                    setSort((prev) => {
                      if (prev?.key !== id) return { key: id, dir: 'asc' };
                      return { key: id, dir: prev?.dir === 'asc' ? 'desc' : 'asc' };
                    });
                    setPage(1);
                  };
                  return (
                    <th key={id} className={thCls}>
                      <button type="button" className="th-sort-btn" onClick={onSort} aria-label={`Sort by ${def.label}`}>
                        <span>{def.label}</span>
                        <span className="th-sort-icons" aria-hidden>
                          <span className={descActive ? 'active' : ''}>▼</span>
                          <span className={ascActive ? 'active' : ''}>▲</span>
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row._id ?? row.id ?? row.asin ?? `${row.productName || 'row'}-${row.reportDate || ''}`}>
                  {visibleOrderedColumnIds.map((id) => {
                    if (!visibleColumns[id]) return null;
                    const cls =
                      id === 'productName'
                        ? 'buybox-col-product-name'
                        : id === 'productCategory'
                          ? 'buybox-col-product-category'
                          : '';
                    return <td key={id} className={cls}>{renderCellByColumnId(id, row)}</td>;
                  })}
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
