/**
 * Mirrors Executive Summary "Deep dive your ASIN performance" table logic
 * (frontend: ExecutiveSummary.jsx tableRows useMemo).
 */

function pickSalesChannel(row) {
  const v = row?.salesChannel ?? row?.channel ?? row?.['Sales Channel'];
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === '—') return '';
  return s;
}

function normalizeChannel(v) {
  return String(v ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function computePct(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0 && c === 0) return 0;
  if (p === 0) return null;
  return ((c - p) / p) * 100;
}

function computeAbs(curr, prev) {
  return (Number(curr) || 0) - (Number(prev) || 0);
}

function aggByAsin(rows) {
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
    if (!prev.productCategory || prev.productCategory === '—') {
      prev.productCategory = r?.productCategory ?? prev.productCategory;
    }
    if (!prev.packSize || prev.packSize === '—') prev.packSize = r?.packSize ?? prev.packSize;
    if (!prev.salesChannel || prev.salesChannel === '—') {
      prev.salesChannel = pickSalesChannel(r) || prev.salesChannel;
    }
    if (!prev.reportMonth || prev.reportMonth === '—') prev.reportMonth = r?.reportMonth ?? prev.reportMonth;
    map.set(asin, prev);
  });
  return map;
}

/**
 * @param {object[]} currentRows
 * @param {object[]} comparisonRows
 * @param {{ salesChannelFilter: string, activeDeepDiveTab: string }} opts
 */
export function buildExecutiveAsinDeepDiveTableRows(currentRows, comparisonRows, opts) {
  const activeDeepDiveTab = opts?.activeDeepDiveTab || 'declining';
  const salesChannelFilter = String(opts?.salesChannelFilter || '').trim();
  const selectedChannel = salesChannelFilter ? normalizeChannel(salesChannelFilter) : '';

  const currMap = aggByAsin(Array.isArray(currentRows) ? currentRows : []);
  const prevMap = aggByAsin(Array.isArray(comparisonRows) ? comparisonRows : []);
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
      productName:
        curr.productName && String(curr.productName).trim()
          ? curr.productName
          : prev.productName || '—',
      productCategory:
        curr.productCategory && String(curr.productCategory).trim()
          ? curr.productCategory
          : prev.productCategory || '—',
      packSize: curr.packSize && String(curr.packSize).trim() ? curr.packSize : prev.packSize || '—',
      salesChannel:
        curr.salesChannel && String(curr.salesChannel).trim()
          ? curr.salesChannel
          : prev.salesChannel || '—',
      reportMonth: curr.reportMonth && String(curr.reportMonth).trim() ? curr.reportMonth : '—',
      currentRevenue: curr.revenue || 0,
      previousRevenue: prev.revenue || 0,
      currentUnits: curr.units || 0,
      previousUnits: prev.units || 0,
      pctChangeRevenue: pct,
      pctChangeUnits: unitsPct,
      absDiffRevenue: abs,
    };
  });

  const filteredByChannel = selectedChannel
    ? merged.filter((r) => normalizeChannel(r.salesChannel) === selectedChannel)
    : merged;

  if (activeDeepDiveTab === 'declining') {
    return filteredByChannel
      .filter((r) => (Number(r.currentRevenue) || 0) < (Number(r.previousRevenue) || 0))
      .sort((a, b) => (Number(a.absDiffRevenue) || 0) - (Number(b.absDiffRevenue) || 0));
  }
  if (activeDeepDiveTab === 'increasing') {
    return filteredByChannel
      .filter((r) => (Number(r.currentRevenue) || 0) > (Number(r.previousRevenue) || 0))
      .sort((a, b) => (Number(b.absDiffRevenue) || 0) - (Number(a.absDiffRevenue) || 0));
  }
  if (activeDeepDiveTab === 'traffic') {
    return filteredByChannel
      .filter((r) => r.pctChangeUnits != null && r.pctChangeUnits < 0)
      .sort((a, b) => (a.pctChangeUnits ?? 0) - (b.pctChangeUnits ?? 0));
  }
  if (activeDeepDiveTab === 'top_selling') {
    return filteredByChannel
      .filter((r) => (Number(r.currentRevenue) || 0) > 0)
      .sort((a, b) => (b.currentRevenue ?? 0) - (a.currentRevenue ?? 0))
      .slice(0, 10);
  }

  return filteredByChannel;
}

function csvEscape(field) {
  const s = field == null ? '' : String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatPctCell(row) {
  const pct = row.pctChangeRevenue;
  const prevR = Number(row.previousRevenue) || 0;
  const currR = Number(row.currentRevenue) || 0;
  if (pct == null) {
    if (prevR === 0 && currR > 0) return 'New';
    return '—';
  }
  if (pct === 0) return '0%';
  if (pct > 0) return `↑${Math.round(pct)}%`;
  return `↓${Math.round(Math.abs(pct))}%`;
}

/**
 * @param {object[]} tableRows from buildExecutiveAsinDeepDiveTableRows
 * @param {{ currentLabel?: string, comparisonLabel?: string }} periodLabels
 */
export function executiveAsinRowsToCsv(tableRows, periodLabels) {
  const prevL = periodLabels?.comparisonLabel || 'Previous period';
  const currL = periodLabels?.currentLabel || 'Current period';
  const headers = [
    'ASIN',
    'Product Name',
    `Revenue (${prevL})`,
    `Revenue (${currL})`,
    'Abs Diff (AED)',
    '% Diff',
  ];
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of tableRows) {
    const absVal = Number(row.absDiffRevenue) || 0;
    lines.push(
      [
        csvEscape(row.asin ?? ''),
        csvEscape(row.productName ?? ''),
        csvEscape(Math.round(Number(row.previousRevenue) || 0)),
        csvEscape(Math.round(Number(row.currentRevenue) || 0)),
        csvEscape(Math.round(absVal)),
        csvEscape(formatPctCell(row)),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}
