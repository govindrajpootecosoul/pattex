import { useState, useEffect, useMemo } from 'react';
import { dashboardApi } from '../../api/api';
import { formatDateDDMonYY } from '../../utils/dateFormat';
import { useSalesChannels } from '../../hooks/useSalesChannels';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Check, ChevronLeft, ChevronRight, Download, Search, Store, X } from 'lucide-react';

export default function ExecutiveSummary() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpiData, setKpiData] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [revenueRows, setRevenueRows] = useState([]);
  const [prevRevenueRows, setPrevRevenueRows] = useState([]);
  const [revenueLoading, setRevenueLoading] = useState(true);
  // Default to top sellers so month filters show rows immediately (declining/increasing can be empty legitimately).
  const [activeDeepDiveTab, setActiveDeepDiveTab] = useState('top_selling');
  const [dateFilterType, setDateFilterType] = useState('CURRENT_DAY'); // CURRENT_MONTH | PREVIOUS_MONTH | CURRENT_DAY | PREVIOUS_DAY | CURRENT_WEEK | PREVIOUS_WEEK
  const [periodLabels, setPeriodLabels] = useState({ currentLabel: 'Current Month', previousLabel: 'Previous Month' });
  const [salesChannelFilter, setSalesChannelFilter] = useState('Seller Central');
  const allSalesChannels = useSalesChannels();
  const [latestUpdatedAtByChannel, setLatestUpdatedAtByChannel] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [asinModal, setAsinModal] = useState({ open: false, title: '', asins: [] });
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [csvExportError, setCsvExportError] = useState('');
  const [sort, setSort] = useState({ key: 'productName', dir: 'asc' }); // default: Product Name A-Z
  const [query, setQuery] = useState('');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [vendorMenuOpen, setVendorMenuOpen] = useState(false);

  const setActiveDeepDiveTabAndResetPage = (tab) => {
    setActiveDeepDiveTab(tab);
    setPage(1);
  };

  const normalizeDbName = (v) => String(v ?? '').trim().toLowerCase();
  const isEmami = useMemo(() => {
    const db = normalizeDbName(user?.databaseName);
    return Boolean(db) && db.includes('emami');
  }, [user?.databaseName]);

  const allowedDateFilters = useMemo(() => {
    if (isEmami) {
      return [
        { value: 'CURRENT_MONTH', label: 'Current Month' },
        { value: 'PREVIOUS_MONTH', label: 'Previous Month' },
      ];
    }
    return [
      { value: 'CURRENT_DAY', label: 'Current Day' },
      { value: 'PREVIOUS_DAY', label: 'Previous Day' },
      { value: 'CURRENT_WEEK', label: 'Current Week' },
      { value: 'PREVIOUS_WEEK', label: 'Previous Week' },
      { value: 'CURRENT_MONTH', label: 'Current Month' },
      { value: 'PREVIOUS_MONTH', label: 'Previous Month' },
    ];
  }, [isEmami]);

  // If Emami user arrives with an unsupported date filter (default is CURRENT_DAY), auto-switch to CURRENT_MONTH.
  useEffect(() => {
    if (!isEmami) return;
    const allowed = new Set(allowedDateFilters.map((o) => o.value));
    if (!allowed.has(dateFilterType)) {
      setDateFilterType('CURRENT_MONTH');
      setPage(1);
    }
  }, [isEmami, allowedDateFilters, dateFilterType]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    dashboardApi
      .getExecutiveSummary({ salesChannel: salesChannelFilter || '', dateFilterType })
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          setData(null);
          setError('Executive Summary returned no data.');
          return;
        }
        setData(payload);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [salesChannelFilter, dateFilterType]);

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .getLatestUpdatedDate({ dataset: 'revenue', salesChannel: salesChannelFilter || '' })
      .then((resp) => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(resp?.updatedAt ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(null);
      });
    return () => { cancelled = true; };
  }, [salesChannelFilter]);

  useEffect(() => {
    let cancelled = false;
    setKpiLoading(true);
    dashboardApi
      .getKeyPerformanceMetrics({
        salesChannel: salesChannelFilter || '',
        dateFilterType,
      })
      .then((resp) => {
        if (cancelled) return;
        setKpiData(resp || null);
      })
      .catch(() => {
        if (cancelled) return;
        setKpiData(null);
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => { cancelled = true; };
  }, [salesChannelFilter, dateFilterType]);

  useEffect(() => {
    let cancelled = false;
    setRevenueLoading(true);
    dashboardApi
      .getRevenue({ dateFilterType, includePeriods: true, salesChannel: salesChannelFilter || '' })
      .then((res) => {
        if (cancelled) return;
        setRevenueRows(Array.isArray(res?.currentRows) ? res.currentRows : []);
        setPrevRevenueRows(Array.isArray(res?.comparisonRows) ? res.comparisonRows : []);
        if (res?.periodLabels?.currentLabel && res?.periodLabels?.comparisonLabel) {
          setPeriodLabels({
            currentLabel: res.periodLabels.currentLabel,
            previousLabel: res.periodLabels.comparisonLabel,
          });
        } else if (res?.periods?.current?.[0] && res?.periods?.comparison?.[0]) {
          const labelFromYm = (ym) => {
            const [y, m] = String(ym).split('-').map(Number);
            if (!y || !m) return String(ym);
            return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
          };
          setPeriodLabels({
            currentLabel: labelFromYm(res.periods.current[0]),
            previousLabel: labelFromYm(res.periods.comparison[0]),
          });
        } else {
          setPeriodLabels({ currentLabel: 'Current Month', previousLabel: 'Previous Month' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setRevenueRows([]);
        setPrevRevenueRows([]);
        setPeriodLabels({ currentLabel: 'Current Month', previousLabel: 'Previous Month' });
      })
      .finally(() => {
        if (!cancelled) setRevenueLoading(false);
      });
    return () => { cancelled = true; };
  }, [dateFilterType, salesChannelFilter]);

  // Hooks must run consistently across renders.
  // Compute table rows even during loading (safe defaults).
  const deepDiveMeta = useMemo(() => {
    return periodLabels;
  }, [periodLabels]);

  const pickSalesChannel = (row) => {
    const v =
      row?.salesChannel ??
      row?.channel ??
      row?.['Sales Channel'];
    if (v == null) return '';
    const s = String(v).trim();
    if (!s || s === '—') return '';
    return s;
  };

  const salesChannelOptions = useMemo(() => {
    if (allSalesChannels.length > 0) return allSalesChannels;
    const collect = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .map((r) => pickSalesChannel(r))
        .filter(Boolean);

    const po = data?.poSummary || {};
    const all = [
      ...collect(revenueRows),
      ...collect(prevRevenueRows),
      ...collect(po.openPODetails),
      ...collect(po.poReceivedDetails),
      ...collect(po.skuNoBuyboxDetails),
    ];
    const seen = new Map();
    all.forEach((v) => {
      const key = v.toLowerCase();
      if (!seen.has(key)) seen.set(key, v);
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [allSalesChannels, revenueRows, prevRevenueRows, data?.poSummary]);

  // Ensure the selected channel matches an available option on first render/load.
  useEffect(() => {
    if (!salesChannelOptions || salesChannelOptions.length === 0) return;
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const current = normalize(salesChannelFilter);
    const optionsNormalized = salesChannelOptions.map((c) => ({ raw: c, key: normalize(c) }));
    const hasExact = current && optionsNormalized.some((o) => o.key === current);
    if (hasExact) return;
    const preferred = optionsNormalized.find((o) => o.key === 'seller central');
    const next = (preferred?.raw || optionsNormalized[0]?.raw || '').toString();
    if (next && next !== salesChannelFilter) {
      setSalesChannelFilter(next);
      setPage(1);
    }
  }, [salesChannelOptions]);

  const tableRows = useMemo(() => {
    const currentRows = Array.isArray(revenueRows) ? revenueRows : [];
    const previousRows = Array.isArray(prevRevenueRows) ? prevRevenueRows : [];
    const normalizeChannel = (v) =>
      String(v ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const selectedChannel = salesChannelFilter ? normalizeChannel(salesChannelFilter) : '';

    const computePct = (curr, prev) => {
      const c = Number(curr) || 0;
      const p = Number(prev) || 0;
      if (p === 0 && c === 0) return 0; // no sales in either period → 0% change (not "missing")
      if (p === 0) return null; // new sales vs zero baseline → show "New" in UI
      return ((c - p) / p) * 100;
    };

    const computeAbs = (curr, prev) => (Number(curr) || 0) - (Number(prev) || 0);

    const aggByAsin = (rows) => {
      const map = new Map();
      rows.forEach((r) => {
        const asin = r?.asin ? String(r.asin).trim() : '';
        if (!asin) return;
        const prev = map.get(asin) || {
          asin,
          productName: r?.productName ?? '—',
          productCategory: r?.productCategory ?? '—',
          packSize: r?.packSize ?? '—',
          salesChannel: pickSalesChannel(r) || '—',
          reportMonth: r?.reportMonth ?? '—',
          revenue: 0,
          units: 0,
        };
        prev.revenue += Number(r?.overallRevenue) || 0;
        prev.units += Number(r?.overallUnit) || 0;
        if (!prev.productName || prev.productName === '—') prev.productName = r?.productName ?? prev.productName;
        if (!prev.productCategory || prev.productCategory === '—') prev.productCategory = r?.productCategory ?? prev.productCategory;
        if (!prev.packSize || prev.packSize === '—') prev.packSize = r?.packSize ?? prev.packSize;
        if (!prev.salesChannel || prev.salesChannel === '—') prev.salesChannel = pickSalesChannel(r) || prev.salesChannel;
        if (!prev.reportMonth || prev.reportMonth === '—') prev.reportMonth = r?.reportMonth ?? prev.reportMonth;
        map.set(asin, prev);
      });
      return map;
    };

    const currMap = aggByAsin(currentRows);
    const prevMap = aggByAsin(previousRows);
    const allAsins = new Set([...currMap.keys(), ...prevMap.keys()]);

    const merged = Array.from(allAsins).map((asin) => {
      const curr = currMap.get(asin) || { revenue: 0, units: 0 };
      const prev = prevMap.get(asin) || { revenue: 0, units: 0 };
      const pct = computePct(curr.revenue, prev.revenue);
      const unitsPct = computePct(curr.units, prev.units);
      const abs = computeAbs(curr.revenue, prev.revenue);
      return {
        id: asin,
        asin,
        productName: (curr.productName && String(curr.productName).trim()) ? curr.productName : (prev.productName || '—'),
        productCategory: (curr.productCategory && String(curr.productCategory).trim()) ? curr.productCategory : (prev.productCategory || '—'),
        packSize: (curr.packSize && String(curr.packSize).trim()) ? curr.packSize : (prev.packSize || '—'),
        salesChannel: (curr.salesChannel && String(curr.salesChannel).trim()) ? curr.salesChannel : (prev.salesChannel || '—'),
        reportMonth: (curr.reportMonth && String(curr.reportMonth).trim()) ? curr.reportMonth : '—',
        currentRevenue: curr.revenue || 0,
        previousRevenue: prev.revenue || 0,
        currentUnits: curr.units || 0,
        previousUnits: prev.units || 0,
        pctChangeRevenue: pct,
        pctChangeUnits: unitsPct,
        absDiffRevenue: abs,
      };
    });

    const filteredByChannel = selectedChannel ? merged.filter((r) => normalizeChannel(r.salesChannel) === selectedChannel) : merged;

    const q = String(query || '').trim().toLowerCase();
    const filteredByQuery = q
      ? filteredByChannel.filter((r) => {
          const asin = String(r?.asin ?? '').toLowerCase();
          const name = String(r?.productName ?? '').toLowerCase();
          return asin.includes(q) || name.includes(q);
        })
      : filteredByChannel;

    if (activeDeepDiveTab === 'declining') {
      return filteredByQuery
        .filter((r) => (Number(r.currentRevenue) || 0) < (Number(r.previousRevenue) || 0))
        .sort((a, b) => (Number(a.absDiffRevenue) || 0) - (Number(b.absDiffRevenue) || 0));
    }
    if (activeDeepDiveTab === 'increasing') {
      return filteredByQuery
        .filter((r) => (Number(r.currentRevenue) || 0) > (Number(r.previousRevenue) || 0))
        .sort((a, b) => (Number(b.absDiffRevenue) || 0) - (Number(a.absDiffRevenue) || 0));
    }
    if (activeDeepDiveTab === 'traffic') {
      // Proxy "traffic" using unit decline (since Orders/PNL dataset in UI maps closest to units).
      return filteredByQuery
        .filter((r) => r.pctChangeUnits != null && r.pctChangeUnits < 0)
        .sort((a, b) => (a.pctChangeUnits ?? 0) - (b.pctChangeUnits ?? 0));
    }
    if (activeDeepDiveTab === 'top_selling') {
      // Only ASINs with revenue in the *current* filter period (second revenue column).
      // No backfill with current=0 — previous day can be 0, but the selected period cannot show 0 here.
      return filteredByQuery
        .filter((r) => (Number(r.currentRevenue) || 0) > 0)
        .sort((a, b) => (b.currentRevenue ?? 0) - (a.currentRevenue ?? 0))
        .slice(0, 10);
    }

    return filteredByQuery;
  }, [revenueRows, prevRevenueRows, activeDeepDiveTab, salesChannelFilter, dateFilterType, query]);

  const sortedRows = useMemo(() => {
    const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
    const key = sort?.key || 'productName';

    const getCellValue = (row) => {
      switch (key) {
        case 'productName':
          return row?.productName ?? '';
        case 'previousRevenue':
          return Number(row?.previousRevenue);
        case 'currentRevenue':
          return Number(row?.currentRevenue);
        case 'previousUnits':
          return Number(row?.previousUnits);
        case 'currentUnits':
          return Number(row?.currentUnits);
        case 'pctDiff':
          // treat "New" as null-ish so it sorts last
          return row?.pctChangeRevenue == null ? null : Number(row?.pctChangeRevenue);
        default:
          return row?.[key];
      }
    };

    const numericKeys = new Set(['previousRevenue', 'currentRevenue', 'previousUnits', 'currentUnits', 'pctDiff']);

    const compare = (a, b) => {
      const av = getCellValue(a);
      const bv = getCellValue(b);
      const aEmpty = av == null || av === '' || (typeof av === 'number' && Number.isNaN(av));
      const bEmpty = bv == null || bv === '' || (typeof bv === 'number' && Number.isNaN(bv));
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (numericKeys.has(key)) {
        const an = Number(av);
        const bn = Number(bv);
        if (an === bn) return 0;
        return an < bn ? -1 : 1;
      }
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true });
    };

    const base = [...tableRows];
    base.sort((a, b) => {
      const c = compare(a, b);
      return dir === 'desc' ? -c : c;
    });
    return base;
  }, [tableRows, sort]);

  const totalRows = sortedRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const pagedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    if (!dateMenuOpen && !vendorMenuOpen) return;
    const onDoc = (e) => {
      const dateRoot = e.target?.closest?.('[data-exec-date-menu-root]');
      const vendorRoot = e.target?.closest?.('[data-exec-vendor-menu-root]');
      if (!dateRoot) setDateMenuOpen(false);
      if (!vendorRoot) setVendorMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [dateMenuOpen, vendorMenuOpen]);

  if (loading) {
    return (
      <div className="exec-summary">
        <div className="exec-loading shimmer-block" />
      </div>
    );
  }

  if (error) return <div className="auth-error">{error}</div>;
  if (!data) {
    return (
      <div className="exec-summary">
        <div className="auth-error">Executive Summary is unavailable.</div>
      </div>
    );
  }

  const poSummary = data.poSummary || {};
  const formatAedRounded = (value) => {
    const n = Number(value) || 0;
    return `AED ${Math.round(n).toLocaleString()}`;
  };

  const formatKpiAed2 = (value) => {
    const n = Number(value) || 0;
    return `AED ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCompactNumber = (value) => {
    const n = Number(value) || 0;
    return n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  };

  const formatCompactAed = (value) => {
    const n = Number(value) || 0;
    const compact = n.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
    return `AED ${compact}`;
  };

  const truncateText = (value, maxChars) => {
    const s = value == null ? '' : String(value);
    if (!maxChars || maxChars <= 0) return s;
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}...`;
  };

  const formatPeriodLabel = (label) => {
    const raw = String(label ?? '').trim();
    if (!raw) return raw;
    // Expected patterns from backend periodLabels:
    // - "YYYY-MM-DD to YYYY-MM-DD" (week)
    // - "YYYY-MM-DD" (day)
    // Keep non-date labels (e.g. "March 2026") as-is.
    const range = raw.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
    if (range) {
      return `${formatDateDDMonYY(range[1])} to ${formatDateDDMonYY(range[2])}`;
    }
    const single = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (single) {
      return formatDateDDMonYY(single[1]);
    }
    return raw;
  };

  // Match backend / Buybox channel normalization (NBSP, multi-space) so PO cards are not emptied by string mismatch.
  const normalizeExecChannel = (value) =>
    String(value ?? '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const normalizedSelectedChannel = normalizeExecChannel(salesChannelFilter);
  const filterPoRowsByChannel = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    if (!normalizedSelectedChannel) return list;
    return list.filter((r) => normalizeExecChannel(r?.salesChannel) === normalizedSelectedChannel);
  };

  const openPODetailsFiltered = filterPoRowsByChannel(poSummary.openPODetails);
  const poReceivedDetailsFiltered = filterPoRowsByChannel(poSummary.poReceivedDetails);
  const skuNoBuyboxDetailsFiltered = filterPoRowsByChannel(poSummary.skuNoBuyboxDetails);

  const normalizeOwner = (owner) => String(owner ?? '').trim().toLowerCase();
  const isAmazonAeOwner = (owner) => {
    const s = normalizeOwner(owner);
    // Treat any value containing "amazon.ae" as Amazon (e.g. "Amazon.ae (Retail)")
    return Boolean(s) && s.includes('amazon.ae');
  };

  const sumBy = (rows, field) =>
    (Array.isArray(rows) ? rows : []).reduce((s, r) => s + (Number(r?.[field]) || 0), 0);

  const openPoSum = sumBy(openPODetailsFiltered, 'openPOs');
  const poReceivedUnitsSum = sumBy(poReceivedDetailsFiltered, 'poReceivedUnits');
  // Count ASINs where Current Owner is NOT Amazon.ae (and not blank).
  const skuNoBuyboxRowsNoAmazon = skuNoBuyboxDetailsFiltered.filter((r) => {
    const owner = normalizeOwner(r?.currentOwner);
    // If owner is blank / "no", treat as not having Amazon buybox.
    if (!owner || owner === 'no') return true;
    return !isAmazonAeOwner(owner);
  });
  const asinWithoutAmazonBuyboxCount = skuNoBuyboxRowsNoAmazon.length;

  const openAsinModal = (type) => {
    const summary = data?.poSummary || {};
    if (!summary) return;
    let title = '';
    let rows = [];
    if (type === 'OPEN_POS') {
      title = 'OPEN POS – ASIN breakdown';
      rows = openPODetailsFiltered;
    } else if (type === 'PO_RECEIVED') {
      title = 'PO RECEIVED – ASIN breakdown';
      rows = poReceivedDetailsFiltered;
    } else if (type === 'SKU_NO_BUYBOX') {
      title = 'ASIN WITH NO BUYBOX – ASIN breakdown';
      rows = skuNoBuyboxRowsNoAmazon;
    }
    setAsinModal({
      open: true,
      title,
      rows,
    });
  };

  const kpiHeaderDisplay = kpiData?.kpiHeader || 'Key Performance Metrics';
  const kpiActualColumnHeader = kpiData?.actualColumnHeader || 'Actual (MTD)';

  const downloadAsinPerformanceCsv = async () => {
    setCsvExportError('');
    setCsvDownloading(true);
    try {
      const blob = await dashboardApi.downloadExecutiveAsinPerformanceCsv({
        salesChannel: salesChannelFilter || '',
        dateFilterType,
        deepDiveTab: activeDeepDiveTab,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asin-performance-${activeDeepDiveTab}-${dateFilterType}.csv`;
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

  const dataUpdatedDisplay = (() => {
    const channelNorm = String(salesChannelFilter || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const isSellerCentral =
      channelNorm === 'seller central' || channelNorm.includes('seller central');
    // Seller Central: show "as of today" (local calendar) on Executive Summary, matching Buybox date UX.
    if (isSellerCentral) {
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return formatDateDDMonYY(ymd);
    }
    // Other channels: latest revenue / snapshot date (same as before).
    const raw = latestUpdatedAtByChannel || data?.dataUpdated || data?.buyboxSnapshotDate || '';
    const dateKey = raw ? String(raw).split('T')[0] : '';
    return dateKey ? formatDateDDMonYY(dateKey) : null;
  })();

  const kpiRows = (() => {
    const t = kpiData?.targets || {};
    const a = kpiData?.actualMTD || {};
    const v = kpiData?.variation || {};
    return [
      {
        metric: 'Overall Revenue',
        target: isEmami ? 0 : Number(t.overallRevenue) || 0,
        actualMTD: Number(a.overallRevenue) || 0,
        actualExpected: null,
        variation: isEmami ? null : (typeof v.overallRevenuePct === 'number' ? v.overallRevenuePct : null),
      },
      {
        metric: 'Overall Spend',
        target: isEmami ? 0 : Number(t.overallSpend) || 0,
        actualMTD: Number(a.overallSpend) || 0,
        actualExpected: null,
        variation: isEmami ? null : (typeof v.overallSpendPct === 'number' ? v.overallSpendPct : null),
      },
    ];
  })();

  const defaultDateFilter = isEmami ? 'CURRENT_MONTH' : 'CURRENT_DAY';
  const isSalesChannelActive = Boolean(salesChannelFilter) && normalizeExecChannel(salesChannelFilter) !== 'seller central';
  const isDateFilterActive = dateFilterType !== defaultDateFilter;
  const isQueryActive = String(query || '').trim().length > 0;
  const selectedDateLabel = allowedDateFilters.find((o) => o.value === dateFilterType)?.label || 'Date Range';

  const sumField = (rows, key) =>
    (Array.isArray(rows) ? rows : []).reduce((s, r) => s + (Number(r?.[key]) || 0), 0);

  const currentUnitsSold = sumField(revenueRows, 'overallUnit');
  const previousUnitsSold = sumField(prevRevenueRows, 'overallUnit');

  const revenueTarget = Number(kpiRows?.[0]?.target) || 0;
  const revenueActual = Number(kpiRows?.[0]?.actualMTD) || 0;
  const spendTarget = Number(kpiRows?.[1]?.target) || 0;
  const spendActual = Number(kpiRows?.[1]?.actualMTD) || 0;
  const tacosPct = revenueActual > 0 ? (spendActual / revenueActual) * 100 : 0;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const pctOfTarget = (actual, target) => (target > 0 ? clamp01(actual / target) : 0);

  const buildSparklinePath = (start, end) => {
    const w = 96;
    const h = 28;
    const pad = 2;
    const steps = 12;
    const s = Number.isFinite(start) ? start : 0;
    const e = Number.isFinite(end) ? end : s;
    const min = Math.min(s, e);
    const max = Math.max(s, e);
    const span = max - min || 1;
    const pts = Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
      const base = s + (e - s) * eased;
      const wobble = Math.sin((i / (steps - 1)) * Math.PI * 2) * span * 0.06;
      const v = base + wobble;
      const x = pad + t * (w - pad * 2);
      const y = pad + (1 - (v - min) / span) * (h - pad * 2);
      return { x, y };
    });
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    return { d, w, h };
  };

  const EmptyState = ({ title, subtitle }) => (
    <div
      style={{
        borderRadius: 16,
        background: 'rgba(255,255,255,0.7)',
        border: '1px solid rgba(15,23,42,0.08)',
        backdropFilter: 'blur(10px)',
        padding: '28px 18px',
        textAlign: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <svg width="180" height="92" viewBox="0 0 180 92" role="img" aria-label="Empty state illustration" style={{ margin: '0 auto 10px' }}>
        <defs>
          <linearGradient id="execEmptyGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#94A3B8" stopOpacity="0.25" />
            <stop offset="1" stopColor="#0F172A" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect x="16" y="18" width="148" height="56" rx="16" fill="url(#execEmptyGrad)" />
        <path d="M36 56 C52 38, 72 68, 92 48 C108 32, 128 62, 144 42" fill="none" stroke="#0F172A" strokeOpacity="0.22" strokeWidth="2" />
        <circle cx="52" cy="44" r="3" fill="#D32F2F" fillOpacity="0.7" />
        <circle cx="92" cy="48" r="3" fill="#D32F2F" fillOpacity="0.7" />
        <circle cx="132" cy="54" r="3" fill="#D32F2F" fillOpacity="0.7" />
      </svg>
      <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 4, color: 'rgba(15,23,42,0.6)', fontSize: 13 }}>{subtitle}</div>
    </div>
  );

  const OwnerBadge = ({ value }) => {
    const raw = String(value ?? '').trim();
    const norm = raw.toLowerCase();
    const isAmazon = norm === 'amazon.ae' || norm.includes('amazon.ae');
    const isUnavailable = !raw || norm === 'unavailable' || norm === 'na' || norm === 'n/a' || norm === '—';

    if (isAmazon) return <span className="exec-pill-badge exec-pill-badge--green">Amazon.ae</span>;
    if (isUnavailable) return <span className="exec-pill-badge exec-pill-badge--slate">Unavailable</span>;
    return <span className="exec-pill-badge exec-pill-badge--amber">{raw}</span>;
  };

  const ChannelBadge = ({ value }) => {
    const raw = String(value ?? '').trim();
    const norm = raw.toLowerCase();
    const isVendorCentral = norm === 'vendor central' || norm.includes('vendor central');
    const isSellerCentral = norm === 'seller central' || norm.includes('seller central');
    if (isVendorCentral) return <span className="exec-pill-badge exec-pill-badge--blue">Vendor Central</span>;
    if (isSellerCentral) return <span className="exec-pill-badge exec-pill-badge--slate">Seller Central</span>;
    if (!raw || norm === 'unavailable' || norm === '—') return <span className="exec-pill-badge exec-pill-badge--slate">Unavailable</span>;
    return <span className="exec-pill-badge exec-pill-badge--slate">{raw}</span>;
  };

  return (
    <div
      className="exec-summary"
      style={{
        paddingTop: '16px',
        paddingBottom: 0,
        background: '#F8F9FA',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
      }}
    >
      <style>{`
        /* Executive Summary deep-dive: keep Product Name compact */
        .exec-deep-dive-product-name {
          width: 260px;
          max-width: 260px;
        }
        .exec-deep-dive-product-name .exec-product-name-cell {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Deep-dive revenue / units: left-aligned like ASIN & product name, tabular figures */
        .exec-summary .table-wrap .exec-deep-dive-metric {
          font-variant-numeric: tabular-nums;
        }

        /* Executive Summary deep-dive: sortable header button */
        .exec-summary .table-wrap th .th-sort-btn {
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

        .exec-summary .table-wrap th.col-num .th-sort-btn {
          justify-content: flex-end;
        }

        .exec-summary .table-wrap th .th-sort-icons {
          display: inline-flex;
          flex-direction: row;
          align-items: center;
          line-height: 1;
          font-size: 0.75rem;
          gap: 2px;
          user-select: none;
        }

        .exec-summary .table-wrap th .th-sort-icons span {
          color: #9ca3af; /* grey for unselected */
          font-weight: 700;
        }

        .exec-summary .table-wrap th .th-sort-icons .active {
          color: #111827; /* black for active */
          font-weight: 900;
        }

        .exec-summary .table-wrap th.th-sort-active .th-sort-btn > span:first-child {
          color: var(--success, #16a34a);
        }

        .exec-summary .exec-hero-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin: 0 0 0.75rem;
        }

        .exec-summary .exec-chips {
          display: inline-flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .exec-summary .exec-chip {
          appearance: none;
          border: 1px solid rgba(15,23,42,0.10);
          backdrop-filter: blur(10px);
          border-radius: 999px;
          padding: 0.4rem 0.6rem;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          cursor: pointer;
        }

        .exec-summary .exec-chip .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .exec-summary .exec-chip .label {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(15,23,42,0.72);
        }

        .exec-summary .exec-chip .value {
          font-size: 0.85rem;
          font-weight: 700;
          color: rgba(15,23,42,0.92);
          font-variant-numeric: tabular-nums;
        }

        .exec-summary .exec-metric-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .exec-summary .exec-metric-card {
          grid-column: span 3;
          border-radius: 18px;
          background: rgba(255,255,255,0.80);
          border: 1px solid rgba(15,23,42,0.08);
          backdrop-filter: blur(12px);
          padding: 18px 18px 16px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          min-height: 128px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        @media (max-width: 1100px) {
          .exec-summary .exec-metric-card { grid-column: span 6; }
        }

        @media (max-width: 640px) {
          .exec-summary .exec-metric-card { grid-column: span 12; }
        }

        .exec-summary .exec-metric-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .exec-summary .exec-metric-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(15,23,42,0.62);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .exec-summary .exec-metric-value {
          font-size: 1.85rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: rgba(15,23,42,0.94);
          font-variant-numeric: tabular-nums;
          line-height: 1.1;
        }

        .exec-summary .exec-metric-sub {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .exec-summary .exec-progress {
          height: 8px;
          border-radius: 999px;
          background: rgba(15,23,42,0.08);
          overflow: hidden;
          flex: 1;
          min-width: 0;
        }

        .exec-summary .exec-progress > span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: #D32F2F; /* Pattex Red */
        }

        .exec-summary .exec-progress-caption {
          font-size: 0.75rem;
          color: rgba(15,23,42,0.58);
          white-space: nowrap;
        }

        .exec-summary .exec-spark {
          opacity: 0.95;
        }

        .exec-summary .exec-seg {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.70);
          backdrop-filter: blur(10px);
          border-radius: 999px;
          padding: 4px;
          gap: 4px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          flex-wrap: wrap;
        }

        .exec-summary .exec-seg button {
          appearance: none;
          border: none;
          background: transparent;
          color: rgba(15,23,42,0.62);
          font-weight: 600;
          font-size: 0.85rem;
          padding: 0.45rem 0.75rem;
          border-radius: 999px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }

        .exec-summary .exec-seg button.active {
          background: #1E293B; /* slate-800 */
          color: rgba(248,250,252,0.98);
        }

        .exec-summary .exec-deep-table {
          border-collapse: separate;
          border-spacing: 0 12px;
        }

        .exec-summary .exec-deep-table tbody tr td {
          background: rgba(255,255,255,0.70);
          border-top: 1px solid rgba(248,250,252,1); /* slate-50 */
          border-bottom: 1px solid rgba(248,250,252,1); /* slate-50 */
        }

        .exec-summary .exec-deep-table tbody tr td:first-child {
          border-left: 1px solid rgba(248,250,252,1); /* slate-50 */
          border-radius: 16px 0 0 16px;
        }

        .exec-summary .exec-deep-table tbody tr td:last-child {
          border-right: 1px solid rgba(248,250,252,1); /* slate-50 */
          border-radius: 0 16px 16px 0;
        }

        .exec-summary .exec-thumb {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          border: 1px solid rgba(15,23,42,0.10);
          overflow: hidden;
          background: linear-gradient(135deg, rgba(211,47,47,0.16), rgba(15,23,42,0.06));
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 10px;
        }

        .exec-summary .exec-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .exec-summary .exec-deep-table tbody tr:hover td {
          background: rgba(248,250,252,0.95);
          transition: background 0.15s ease;
        }

        .exec-summary .exec-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          font-weight: 700;
          font-size: 0.78rem;
          line-height: 1;
          border: 1px solid rgba(15,23,42,0.10);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .exec-summary .exec-badge.positive {
          background: #ECFDF5; /* green-50 */
          color: #15803D; /* green-700 */
          border-color: rgba(34,197,94,0.18);
        }

        .exec-summary .exec-badge.negative {
          background: #FEF2F2; /* red-50 */
          color: #B91C1C; /* red-700 */
          border-color: rgba(239,68,68,0.20);
        }

        .exec-summary .exec-badge.neutral {
          background: rgba(148,163,184,0.14);
          color: rgba(51,65,85,0.92);
          border-color: rgba(148,163,184,0.22);
        }

        .exec-summary .exec-commandbar {
          background: rgba(255,255,255,0.90);
          border: 1px solid rgba(15,23,42,0.06);
          border-bottom-color: rgba(226,232,240,0.9);
          border-radius: 18px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          padding: 12px 14px 10px;
          margin-bottom: 0.85rem;
          backdrop-filter: blur(10px);
          position: relative;
          z-index: 60;
        }

        .exec-summary .exec-commandbar-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .exec-summary .exec-title {
          font-weight: 800;
          font-size: 18px;
          letter-spacing: -0.02em;
          color: #0F172A;
          line-height: 1.2;
        }

        .exec-summary .exec-updated-muted {
          margin-top: 4px;
          color: rgba(15,23,42,0.55);
          font-size: 12.5px;
        }

        .exec-summary .exec-commandbar-filters {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .exec-summary .exec-filter-left {
          display: inline-flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          align-items: center;
          flex: 1;
          min-width: 260px;
        }

        .exec-summary .exec-filter-field {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #F8FAFC; /* slate-50 */
          border: 1px solid #E2E8F0; /* slate-200 */
          border-radius: 12px;
          padding: 0 10px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
          transition: box-shadow 0.15s, border-color 0.15s;
          height: 36px; /* h-9 */
        }

        .exec-summary .exec-filter-field.active {
          border-color: rgba(211,47,47,0.35);
          box-shadow: 0 0 0 1px rgba(211,47,47,0.30);
        }

        .exec-summary .exec-filter-icon {
          color: rgba(15,23,42,0.55);
          display: inline-flex;
        }

        .exec-summary .exec-search .exec-filter-icon {
          margin-left: -2px; /* nudge icon slightly left */
        }

        .exec-summary .exec-filter-select {
          appearance: none;
          border: none;
          background: transparent;
          font: inherit;
          color: rgba(15,23,42,0.78);
          font-weight: 600;
          padding-right: 18px;
          outline: none;
          cursor: pointer;
          font-size: 0.875rem; /* text-sm */
          white-space: nowrap;
        }

        .exec-summary .exec-filter-select:focus {
          outline: none;
        }

        .exec-summary .exec-search {
          flex: 1;
          min-width: 240px;
        }

        .exec-summary .exec-search input {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          font: inherit;
          font-size: 0.875rem; /* text-sm */
          color: rgba(15,23,42,0.78);
          font-weight: 600;
        }

        .exec-summary .exec-search input::placeholder {
          color: rgba(148,163,184,1); /* #94A3B8 */
          font-weight: 500;
          font-size: 0.875rem; /* text-sm */
        }

        .exec-summary .exec-filter-field .exec-filter-icon svg {
          width: 14px;
          height: 14px;
        }

        .exec-summary .exec-ghost-btn {
          appearance: none;
          border: 1px solid rgba(226,232,240,1); /* slate-200 */
          background: rgba(255,255,255,1);
          color: rgba(71,85,105,1); /* slate-600 */
          border-radius: 12px;
          padding: 8px 10px;
          height: 36px; /* h-9 */
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .exec-summary .exec-ghost-btn:hover {
          background: rgba(248,250,252,1); /* slate-50 */
          border-color: rgba(203,213,225,1); /* slate-300 */
          color: rgba(51,65,85,1); /* slate-700 */
        }

        .exec-summary .exec-popover {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          width: 100%;
          min-width: 100%;
          max-width: 100%;
          background: rgba(255,255,255,0.96);
          border: 1px solid rgba(15,23,42,0.10);
          border-radius: 16px;
          box-shadow: 0 18px 40px rgba(0,0,0,0.14);
          padding: 8px 0; /* py-2 */
          z-index: 1000;
          backdrop-filter: blur(10px);
        }

        .exec-summary .exec-popover-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: none;
          background: transparent;
          border-radius: 12px;
          padding: 8px 16px; /* px-4 py-2 */
          cursor: pointer;
          color: rgba(51,65,85,1); /* slate-700 */
          font-weight: 600;
          font-size: 0.875rem; /* text-sm */
          white-space: nowrap;
        }

        .exec-summary .exec-popover-item:hover {
          background: rgba(248,250,252,1); /* slate-50 */
        }

        .exec-summary .exec-popover-item.active {
          background: rgba(254,242,242,1); /* red-50 */
          color: #991B1B; /* red-800 */
        }

        .exec-summary .exec-popover-item .muted {
          color: rgba(100,116,139,1); /* slate-500 */
          font-weight: 600;
          font-size: 12px;
        }

        .exec-summary .exec-popover-item > span:not(.exec-popover-leading-check) {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .exec-summary .exec-filter-field:focus-within {
          border-color: #D32F2F;
          box-shadow: 0 0 0 2px rgba(211,47,47,0.12);
        }

        .exec-summary .exec-footerbar {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          padding-top: 12px;
          border-top: 1px solid rgba(226,232,240,0.9);
        }

        .exec-summary .exec-footer-meta {
          color: rgba(100,116,139,1); /* #64748B */
          font-size: 0.75rem; /* text-xs */
          font-weight: 600;
        }

        .exec-summary .exec-pager {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .exec-summary .exec-pager-btn {
          appearance: none;
          border: 1px solid rgba(226,232,240,1);
          background: rgba(255,255,255,0.9);
          color: rgba(15,23,42,0.75);
          border-radius: 10px;
          height: 34px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .exec-summary .exec-pager-btn:hover {
          background: rgba(248,250,252,1);
          border-color: rgba(203,213,225,1);
          color: rgba(15,23,42,0.90);
        }

        .exec-summary .exec-pager-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Executive Summary modal polish */
        .exec-summary .exec-modal {
          background: #ffffff;
          border-radius: 24px; /* rounded-2xl */
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); /* shadow-2xl */
          border: 1px solid rgba(226,232,240,0.9);
          overflow: hidden;
          position: relative;
        }

        .exec-summary .exec-modal::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: #D32F2F; /* Pattex Red */
        }

        .exec-summary .exec-modal-header {
          padding: 18px 18px 10px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .exec-summary .exec-modal-title {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: -0.01em;
          color: #1E293B; /* slate-800 */
        }

        .exec-summary .exec-modal-close {
          appearance: none;
          border: 1px solid rgba(226,232,240,1); /* slate-200 */
          background: #ffffff;
          color: rgba(100,116,139,1); /* slate-500 */
          width: 32px;
          height: 32px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          flex-shrink: 0;
          padding: 0;
          line-height: 0;
        }

        .exec-summary .exec-modal-close:hover {
          background: rgba(241,245,249,1); /* slate-100 */
          border-color: rgba(203,213,225,1); /* slate-300 */
          color: rgba(51,65,85,1); /* slate-700 */
        }

        .exec-summary .exec-modal-tablewrap {
          margin: 0 18px 18px;
          border-radius: 18px;
          border: 1px solid rgba(226,232,240,0.9);
          overflow: auto;
          max-height: 58vh;
          scrollbar-width: thin;
          scrollbar-color: rgba(226,232,240,1) transparent;
        }

        .exec-summary .exec-modal-tablewrap::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .exec-summary .exec-modal-tablewrap::-webkit-scrollbar-thumb {
          background: rgba(226,232,240,1); /* slate-200 */
          border-radius: 999px;
        }
        .exec-summary .exec-modal-tablewrap::-webkit-scrollbar-track {
          background: transparent;
        }

        .exec-summary .exec-modal-table thead th {
          background: rgba(241,245,249,1); /* slate-100 */
          text-transform: uppercase;
          letter-spacing: 0.10em; /* tracking-wider */
          font-size: 10px; /* text-[10px] */
          color: rgba(51,65,85,1); /* slate-700 */
          border-bottom: 1px solid rgba(248,250,252,1); /* slate-50 */
        }

        .exec-summary .exec-modal-table tbody td {
          padding-top: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(248,250,252,1); /* slate-50 */
        }

        .exec-summary .exec-modal-table tbody tr:last-child td {
          border-bottom: none;
        }

        .exec-summary .exec-modal-num {
          font-weight: 700;
          color: rgba(15,23,42,0.90);
        }

        .exec-summary .exec-pill-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.18rem 0.5rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
          border: 1px solid rgba(226,232,240,1);
          white-space: nowrap;
        }

        .exec-summary .exec-pill-badge--blue {
          background: rgba(219,234,254,1); /* blue-100 */
          color: rgba(30,64,175,1); /* blue-800 */
          border-color: rgba(191,219,254,1); /* blue-200 */
        }

        .exec-summary .exec-pill-badge--green {
          background: rgba(236,253,245,1); /* green-50 */
          color: rgba(21,128,61,1); /* green-700 */
          border-color: rgba(167,243,208,1); /* green-200 */
        }

        .exec-summary .exec-pill-badge--slate {
          background: rgba(241,245,249,1); /* slate-100 */
          color: rgba(100,116,139,1); /* slate-500 */
          border-color: rgba(226,232,240,1); /* slate-200 */
        }

        .exec-summary .exec-pill-badge--amber {
          background: rgba(255,251,235,1); /* amber-50 */
          color: rgba(180,83,9,1); /* amber-700 */
          border-color: rgba(254,243,199,1); /* amber-200 */
        }

        .exec-summary .exec-modal-product {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
      <header className="exec-commandbar fade-in-up" aria-label="Executive Summary command bar">
        <div className="exec-commandbar-top">
          <div>
            <div className="exec-title">Executive Summary</div>
            {dataUpdatedDisplay && (
              <div className="exec-updated-muted">
                Data updated as of <strong>{dataUpdatedDisplay}</strong>
              </div>
            )}
          </div>
          <div className="exec-chips" aria-label="Purchase order status">
            <button
              type="button"
              className="exec-chip"
              onClick={() => openAsinModal('OPEN_POS')}
              style={{
                background: 'rgba(59,130,246,0.10)',
                borderColor: 'rgba(59,130,246,0.18)',
              }}
            >
              <span className="dot" style={{ background: 'rgba(59,130,246,0.65)' }} />
              <span className="label" style={{ color: 'rgba(30,64,175,0.85)' }}>Open POs</span>
              <span className="value" style={{ color: 'rgba(30,58,138,0.92)' }}>{Math.round(openPoSum).toLocaleString()}</span>
            </button>
            <button
              type="button"
              className="exec-chip"
              onClick={() => openAsinModal('PO_RECEIVED')}
              style={{
                background: 'rgba(59,130,246,0.08)',
                borderColor: 'rgba(59,130,246,0.16)',
              }}
            >
              <span className="dot" style={{ background: 'rgba(59,130,246,0.35)' }} />
              <span className="label" style={{ color: 'rgba(30,64,175,0.82)' }}>PO Received</span>
              <span className="value" style={{ color: 'rgba(30,58,138,0.92)' }}>{Math.round(poReceivedUnitsSum).toLocaleString()}</span>
            </button>
            <button
              type="button"
              className="exec-chip"
              onClick={() => openAsinModal('SKU_NO_BUYBOX')}
              style={{
                background: '#FEE2E2', /* red-100 */
                borderColor: '#FECACA', /* red-200 */
              }}
            >
              <span className="dot" style={{ background: '#DC2626' }} />
              <span className="label" style={{ color: '#DC2626' }}>No Buybox</span>
              <span className="value" style={{ color: '#DC2626' }}>{asinWithoutAmazonBuyboxCount.toLocaleString()}</span>
            </button>
          </div>
        </div>

        <div className="exec-commandbar-filters">
          <div className="exec-filter-left">
            <div className={`exec-filter-field exec-search ${isQueryActive ? 'active' : ''}`}>
              <span className="exec-filter-icon" aria-hidden="true">
                <Search size={16} strokeWidth={1.5} />
              </span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search ASIN or Product..."
                aria-label="Search ASIN or Product"
              />
            </div>

            <div
              className={`exec-filter-field ${isSalesChannelActive ? 'active' : ''}`}
              data-exec-vendor-menu-root
              style={{ position: 'relative' }}
            >
              <span className="exec-filter-icon" aria-hidden="true">
                <Store size={16} strokeWidth={1.5} />
              </span>
              <button
                type="button"
                className="exec-filter-select"
                aria-label="Vendor or Seller"
                onClick={() => setVendorMenuOpen((v) => !v)}
                style={{ paddingRight: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {salesChannelFilter || 'Vendor / Seller'}
                <span aria-hidden style={{ color: 'rgba(15,23,42,0.45)', fontWeight: 800 }}>▾</span>
              </button>
              {vendorMenuOpen ? (
                <div className="exec-popover" role="menu" aria-label="Vendor or Seller options">
                  {salesChannelOptions.map((ch) => {
                    const active = ch === salesChannelFilter;
                    return (
                      <button
                        key={ch}
                        type="button"
                        className={`exec-popover-item ${active ? 'active' : ''}`}
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setSalesChannelFilter(ch);
                          setPage(1);
                          setVendorMenuOpen(false);
                        }}
                      >
                        <span>{ch}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div
              className={`exec-filter-field ${isDateFilterActive ? 'active' : ''}`}
              data-exec-date-menu-root
              style={{ position: 'relative' }}
            >
              <span className="exec-filter-icon" aria-hidden="true">
                <Calendar size={16} strokeWidth={1.5} />
              </span>
              <button
                type="button"
                className="exec-filter-select"
                aria-label="Date range"
                onClick={() => setDateMenuOpen((v) => !v)}
                style={{ paddingRight: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {selectedDateLabel}
                <span aria-hidden style={{ color: 'rgba(15,23,42,0.45)', fontWeight: 800 }}>▾</span>
              </button>
              {dateMenuOpen ? (
                <div className="exec-popover" role="menu" aria-label="Date range options">
                  {allowedDateFilters.map((opt) => {
                    const active = opt.value === dateFilterType;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`exec-popover-item ${active ? 'active' : ''}`}
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          setDateFilterType(opt.value);
                          setPage(1);
                          setDateMenuOpen(false);
                        }}
                      >
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="fade-in-up" style={{ animationDelay: '120ms' }}>
        <div className="exec-metric-grid" aria-label="Key metrics bento grid">
          {(() => {
            const revSpark = buildSparklinePath(revenueTarget || revenueActual * 0.8, revenueActual);
            const spendSpark = buildSparklinePath(spendTarget || spendActual * 0.8, spendActual);
            const unitsSpark = buildSparklinePath(previousUnitsSold || currentUnitsSold * 0.85, currentUnitsSold);
            const tacosSpark = buildSparklinePath(Math.max(0, tacosPct * 0.85), tacosPct);

            const MetricCard = ({ title, value, spark, showProgress, progressValue, progressCaption }) => (
              <div className="exec-metric-card">
                <div className="exec-metric-top">
                  <div>
                    <div className="exec-metric-title">{title}</div>
                    <div className="exec-metric-value">{value}</div>
                  </div>
                  <svg className="exec-spark" width={spark.w} height={spark.h} viewBox={`0 0 ${spark.w} ${spark.h}`} aria-hidden="true">
                    <path d={spark.d} fill="none" stroke="rgba(15,23,42,0.55)" strokeWidth="2" strokeLinecap="round" />
                    <path d={spark.d} fill="none" stroke="rgba(211,47,47,0.55)" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
                  </svg>
                </div>
                <div style={{ marginTop: 'auto' }}>
                  {showProgress ? (
                    <>
                      <div className="exec-progress" aria-label="Actual vs target progress">
                        <span style={{ width: `${Math.round(progressValue * 100)}%` }} />
                      </div>
                      <div className="exec-progress-caption" style={{ marginTop: 8 }}>
                        {progressCaption}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.56)' }}>
                      Trend based on selected period
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <>
                <MetricCard
                  title="Revenue"
                  value={kpiLoading ? '—' : formatCompactAed(revenueActual)}
                  spark={revSpark}
                  showProgress={!kpiLoading && revenueTarget > 0}
                  progressValue={pctOfTarget(revenueActual, revenueTarget)}
                  progressCaption={`MTD ${formatCompactAed(revenueActual)} / ${formatCompactAed(revenueTarget)}`}
                />
                <MetricCard
                  title="Spend"
                  value={kpiLoading ? '—' : formatCompactAed(spendActual)}
                  spark={spendSpark}
                  showProgress={!kpiLoading && spendTarget > 0}
                  progressValue={pctOfTarget(spendActual, spendTarget)}
                  progressCaption={`MTD ${formatCompactAed(spendActual)} / ${formatCompactAed(spendTarget)}`}
                />
                <MetricCard
                  title="Units Sold"
                  value={revenueLoading ? '—' : formatCompactNumber(currentUnitsSold)}
                  spark={unitsSpark}
                  showProgress={false}
                />
                <MetricCard
                  title="TACOS"
                  value={kpiLoading ? '—' : `${tacosPct.toFixed(2)}%`}
                  spark={tacosSpark}
                  showProgress={false}
                />
              </>
            );
          })()}
        </div>
      </section>

      <div className="exec-lower-row">
        <div
          className="card fade-in-up"
          style={{ animationDelay: '320ms', gridColumn: '1 / -1', minWidth: 0 }}
        >
          <div
            className="exec-deep-dive-header"
            style={{
              marginBottom: '0.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div>
              <h3>Deep dive your ASIN performance</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
              <button
                type="button"
                className="exec-ghost-btn"
                onClick={downloadAsinPerformanceCsv}
                disabled={revenueLoading || csvDownloading}
              >
                <Download size={16} strokeWidth={1.5} />
                {csvDownloading ? 'Preparing…' : 'Download CSV'}
              </button>
              {csvExportError ? (
                <span className="section-muted" style={{ color: 'var(--danger, #c62828)', fontSize: '0.85rem' }}>
                  {csvExportError}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="exec-seg" role="tablist" aria-label="Deep dive toggle">
              <button
                type="button"
                className={activeDeepDiveTab === 'declining' ? 'active' : ''}
                onClick={() => setActiveDeepDiveTabAndResetPage('declining')}
                role="tab"
                aria-selected={activeDeepDiveTab === 'declining'}
              >
                Declining
              </button>
              <button
                type="button"
                className={activeDeepDiveTab === 'increasing' ? 'active' : ''}
                onClick={() => setActiveDeepDiveTabAndResetPage('increasing')}
                role="tab"
                aria-selected={activeDeepDiveTab === 'increasing'}
              >
                Increasing
              </button>
              <button
                type="button"
                className={activeDeepDiveTab === 'top_selling' ? 'active' : ''}
                onClick={() => setActiveDeepDiveTabAndResetPage('top_selling')}
                role="tab"
                aria-selected={activeDeepDiveTab === 'top_selling'}
              >
                Top selling
              </button>
            </div>
          </div>
          {revenueLoading ? (
            <div className="shimmer-block" style={{ minHeight: 200 }} />
          ) : (
            <>
              <div
                className="table-wrap"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderRadius: 18,
                  padding: 12,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                <table className="data-table exec-deep-table">
                  <thead>
                    <tr>
                      <th>ASIN</th>
                      <th>Thumbnail</th>
                      {(() => {
                        const prevLabel = formatPeriodLabel(deepDiveMeta.previousLabel);
                        const currLabel = formatPeriodLabel(deepDiveMeta.currentLabel);
                        const cols = [
                          { key: 'productName', label: 'Product', cls: 'exec-deep-dive-product-name' },
                          { key: 'previousRevenue', label: `Revenue (${prevLabel})`, cls: 'exec-deep-dive-metric' },
                          { key: 'currentRevenue', label: `Revenue (${currLabel})`, cls: 'exec-deep-dive-metric' },
                          { key: 'previousUnits', label: `Units Sold (${prevLabel})`, cls: 'exec-deep-dive-metric' },
                          { key: 'currentUnits', label: `Units Sold (${currLabel})`, cls: 'exec-deep-dive-metric' },
                          { key: 'pctDiff', label: '% Diff', cls: 'col-num' },
                        ];
                        return cols.map((c) => {
                          const isActive = sort?.key === c.key;
                          const ascActive = isActive && sort?.dir === 'asc';
                          const descActive = isActive && sort?.dir === 'desc';
                          const thCls = [c.cls, isActive ? 'th-sort-active' : ''].filter(Boolean).join(' ');
                          const onSort = () => {
                            setSort((prev) => {
                              if (prev?.key !== c.key) return { key: c.key, dir: 'asc' };
                              return { key: c.key, dir: prev?.dir === 'asc' ? 'desc' : 'asc' };
                            });
                            setPage(1);
                          };
                          return (
                            <th key={c.key} className={thCls}>
                              <button type="button" className="th-sort-btn" onClick={onSort} aria-label={`Sort by ${c.label}`}>
                                <span>{c.label}</span>
                                <span className="th-sort-icons" aria-hidden>
                                  <span className={descActive ? 'active' : ''}>▼</span>
                                  <span className={ascActive ? 'active' : ''}>▲</span>
                                </span>
                              </button>
                            </th>
                          );
                        });
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="text-secondary">{row.asin ?? '—'}</span></td>
                        <td>
                          <span className="exec-thumb" aria-hidden="true">
                            {row?.imageUrl || row?.thumbnailUrl || row?.productImageUrl ? (
                              <img
                                src={row.imageUrl || row.thumbnailUrl || row.productImageUrl}
                                alt=""
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                  d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14"
                                  fill="none"
                                  stroke="rgba(15,23,42,0.55)"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d="M3 17l5-5 4 4 3-3 6 6"
                                  fill="none"
                                  stroke="rgba(211,47,47,0.55)"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                        </td>
                        <td className="exec-deep-dive-product-name">
                          <div className="exec-product-name-cell" title={row.productName ?? ''}>
                            {row.productName ? truncateText(row.productName, 44) : '—'}
                          </div>
                        </td>
                        <td className="exec-deep-dive-metric">{formatAedRounded(row.previousRevenue)}</td>
                        <td className="exec-deep-dive-metric">{formatAedRounded(row.currentRevenue)}</td>
                        <td className="exec-deep-dive-metric">{(Number(row.previousUnits) || 0).toLocaleString()}</td>
                        <td className="exec-deep-dive-metric">{(Number(row.currentUnits) || 0).toLocaleString()}</td>
                        <td className="col-num">
                          {row.pctChangeRevenue == null ? (
                            (Number(row.previousRevenue) || 0) === 0 && (Number(row.currentRevenue) || 0) > 0 ? (
                              <span className="exec-badge positive">New</span>
                            ) : (
                              <span className="exec-badge neutral">—</span>
                            )
                          ) : row.pctChangeRevenue === 0 ? (
                            <span className="exec-badge neutral">0%</span>
                          ) : row.pctChangeRevenue > 0 ? (
                            <span className="exec-badge positive">↑{Math.round(row.pctChangeRevenue)}%</span>
                          ) : (
                            <span className="exec-badge negative">↓{Math.round(Math.abs(row.pctChangeRevenue))}%</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!revenueLoading && pagedRows.length === 0 ? (
                <div style={{ marginTop: 12 }}>
                  <EmptyState
                    title="No ASINs match this view"
                    subtitle="Try “Top selling”, change period, or switch sales channel to explore performance."
                  />
                </div>
              ) : null}
              <div className="exec-footerbar" aria-label="Pagination">
                <div className="exec-footer-meta">
                  Showing <strong>{totalRows === 0 ? 0 : startIndex + 1}</strong> to{' '}
                  <strong>{Math.min(startIndex + pageSize, totalRows)}</strong> of <strong>{totalRows}</strong> items
                </div>

                <div className="exec-pager">
                  <div className={`exec-filter-field ${pageSize !== 20 ? 'active' : ''}`} style={{ height: 32, padding: '0 10px' }}>
                    <span className="exec-filter-icon" aria-hidden="true" style={{ marginRight: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(15,23,42,0.55)' }}>Items</span>
                    </span>
                    <select
                      className="exec-filter-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value) || 20);
                        setPage(1);
                      }}
                      aria-label="Items per page"
                      style={{ fontWeight: 700, fontSize: 12, paddingRight: 16, color: '#334155' }}
                    >
                      {[10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n} / page
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="exec-pager-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} strokeWidth={1.5} />
                    Prev
                  </button>
                  <button
                    type="button"
                    className="exec-pager-btn"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight size={16} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {asinModal.open && (
        <div
          className="modal-backdrop"
          style={{
            zIndex: 5000,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(6px)',
          }}
          onClick={() => setAsinModal({ open: false, title: '', rows: [] })}
        >
          <div
            className="modal modal-large exec-modal"
            style={{ zIndex: 5001, background: '#fff' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="exec-modal-header">
              <div className="exec-modal-title">{asinModal.title}</div>
              <button
                type="button"
                className="exec-modal-close"
                aria-label="Close modal"
                onClick={() => setAsinModal({ open: false, title: '', rows: [] })}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="table-wrap exec-modal-tablewrap">
              {!Array.isArray(asinModal.rows) || asinModal.rows.length === 0 ? (
                <p className="section-muted">No ASINs found for this metric.</p>
              ) : (
                <table className="data-table exec-modal-table">
                  <thead>
                    <tr>
                      <th>ASIN</th>
                      <th>Product Name</th>
                      <th>Channel</th>
                      <th className="col-num">Open POs</th>
                      <th className="col-num">PO Received Units</th>
                      <th>Current Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asinModal.rows.map((row) => (
                      <tr key={row.asin}>
                        <td>
                          <span className="text-secondary">{row.asin}</span>
                        </td>
                        <td>
                          <div className="exec-modal-product" title={row.productName ?? ''}>
                            {row.productName ?? '—'}
                          </div>
                        </td>
                        <td><ChannelBadge value={row.salesChannel} /></td>
                        <td className="col-num exec-modal-num">{Number(row.openPOs) || 0}</td>
                        <td className="col-num exec-modal-num">{Number(row.poReceivedUnits) || 0}</td>
                        <td><OwnerBadge value={row.currentOwner} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
