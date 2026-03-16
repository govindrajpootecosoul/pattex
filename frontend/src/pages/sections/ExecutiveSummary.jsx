import { useState, useEffect, useMemo } from 'react';
import { dashboardApi } from '../../api/api';
import Pagination from '../../components/Pagination';

export default function ExecutiveSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revenueRows, setRevenueRows] = useState([]);
  const [prevRevenueRows, setPrevRevenueRows] = useState([]);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [activeDeepDiveTab, setActiveDeepDiveTab] = useState('declining');
  const [dateFilterType, setDateFilterType] = useState('CURRENT_DAY'); // CURRENT_MONTH | PREVIOUS_MONTH | CURRENT_DAY | PREVIOUS_DAY | CURRENT_WEEK | PREVIOUS_WEEK
  const [periodLabels, setPeriodLabels] = useState({ currentLabel: 'Current Month', previousLabel: 'Previous Month' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [asinModal, setAsinModal] = useState({ open: false, title: '', asins: [] });

  const setActiveDeepDiveTabAndResetPage = (tab) => {
    setActiveDeepDiveTab(tab);
    setPage(1);
  };

  useEffect(() => {
    dashboardApi
      .getExecutiveSummary()
      .then((payload) => {
        if (!payload) {
          setData(null);
          setError('Executive Summary returned no data.');
          return;
        }
        setData(payload);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRevenueLoading(true);
    dashboardApi
      .getRevenue({ dateFilterType, includePeriods: true })
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
  }, [dateFilterType]);

  // Hooks must run consistently across renders.
  // Compute table rows even during loading (safe defaults).
  const deepDiveMeta = useMemo(() => {
    return periodLabels;
  }, [periodLabels]);

  const tableRows = useMemo(() => {
    const currentRows = Array.isArray(revenueRows) ? revenueRows : [];
    const previousRows = Array.isArray(prevRevenueRows) ? prevRevenueRows : [];

    const computePct = (curr, prev) => {
      const c = Number(curr) || 0;
      const p = Number(prev) || 0;
      if (p === 0) return null; // undefined % change (new launch or both 0)
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
          salesChannel: r?.salesChannel ?? '—',
          reportMonth: r?.reportMonth ?? '—',
          revenue: 0,
          units: 0,
        };
        prev.revenue += Number(r?.overallRevenue) || 0;
        prev.units += Number(r?.overallUnit) || 0;
        if (!prev.productName || prev.productName === '—') prev.productName = r?.productName ?? prev.productName;
        if (!prev.productCategory || prev.productCategory === '—') prev.productCategory = r?.productCategory ?? prev.productCategory;
        if (!prev.packSize || prev.packSize === '—') prev.packSize = r?.packSize ?? prev.packSize;
        if (!prev.salesChannel || prev.salesChannel === '—') prev.salesChannel = r?.salesChannel ?? prev.salesChannel;
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

    if (activeDeepDiveTab === 'declining') {
      return merged
        .filter((r) => (Number(r.currentRevenue) || 0) < (Number(r.previousRevenue) || 0))
        .sort((a, b) => (Number(a.absDiffRevenue) || 0) - (Number(b.absDiffRevenue) || 0));
    }
    if (activeDeepDiveTab === 'increasing') {
      return merged
        .filter((r) => (Number(r.currentRevenue) || 0) > (Number(r.previousRevenue) || 0))
        .sort((a, b) => (Number(b.absDiffRevenue) || 0) - (Number(a.absDiffRevenue) || 0));
    }
    if (activeDeepDiveTab === 'traffic') {
      // Proxy "traffic" using unit decline (since Orders/PNL dataset in UI maps closest to units).
      return merged
        .filter((r) => r.pctChangeUnits != null && r.pctChangeUnits < 0)
        .sort((a, b) => (a.pctChangeUnits ?? 0) - (b.pctChangeUnits ?? 0));
    }
    if (activeDeepDiveTab === 'top_selling') {
      return merged
        .slice()
        .sort((a, b) => (b.currentRevenue ?? 0) - (a.currentRevenue ?? 0))
        .slice(0, 10);
    }

    return merged;
  }, [revenueRows, prevRevenueRows, activeDeepDiveTab]);

  const totalRows = tableRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const pagedRows = tableRows.slice(startIndex, startIndex + pageSize);

  const openAsinModal = (type) => {
    const summary = data?.poSummary || {};
    if (!summary) return;
    let title = '';
    let rows = [];
    if (type === 'OPEN_POS') {
      title = 'OPEN POS – ASIN breakdown';
      rows = Array.isArray(summary.openPODetails) ? summary.openPODetails : [];
    } else if (type === 'PO_RECEIVED') {
      title = 'PO RECEIVED – ASIN breakdown';
      rows = Array.isArray(summary.poReceivedDetails) ? summary.poReceivedDetails : [];
    } else if (type === 'SKU_NO_BUYBOX') {
      title = 'SKU WT NO BUYBOX – ASIN breakdown';
      rows = Array.isArray(summary.skuNoBuyboxDetails) ? summary.skuNoBuyboxDetails : [];
    }
    setAsinModal({
      open: true,
      title,
      rows,
    });
  };

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

  // Force KPI table to show zeros for now (no API values).
  const kpiRows = [
    { metric: 'Overall Revenue', target: 0, actualMTD: 0, actualExpected: null, variation: null },
    { metric: 'Overall Spend', target: 0, actualMTD: 0, actualExpected: null, variation: null },
  ];

  return (
    <div className="exec-summary" style={{ paddingTop: '16px', paddingBottom: 0 }}>
      <header className="exec-header-row fade-in-up" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="exec-header-right">
          <select
            className="deep-dive-period-select"
            value={dateFilterType}
            onChange={(e) => {
              setDateFilterType(e.target.value);
              setPage(1);
            }}
            aria-label="Date range"
          >
            <option value="CURRENT_DAY">Current Day</option>
            <option value="PREVIOUS_DAY">Previous Day</option>
            <option value="CURRENT_WEEK">Current Week</option>
            <option value="PREVIOUS_WEEK">Previous Week</option>
            <option value="CURRENT_MONTH">Current Month</option>
            <option value="PREVIOUS_MONTH">Previous Month</option>
          </select>
        </div>
      </header>

      <section className="card exec-kpi-shell fade-in-up">
        <div className="exec-kpi-top">
          <h3 className="exec-kpi-title">Key Performance Metrics</h3>
          {data.dataUpdated && (
            <p className="exec-updated-text">
              <span className="pulse-dot" />
              Data updated as of <strong>{data.dataUpdated}</strong>
            </p>
          )}
        </div>

        <div className="exec-kpi-main">
          <div className="exec-metrics-main">
            <div className="exec-po-card">
              <div className="exec-po-header">Key Performance Metrics</div>
              <div className="table-wrap exec-table">
                <table className="data-table exec-po-table">
                  <thead>
                    <tr>
                      <th>Metrics</th>
                      <th className="col-num">Targets</th>
                      <th className="col-num">Actual (MTD)</th>
                      <th className="col-num">Actual (Exp)</th>
                      <th className="col-num">Variation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.map((row, i) => {
                      const variationNumber =
                        typeof row.variation === 'number'
                          ? row.variation
                          : parseFloat(String(row.variation || '').replace('%', ''));
                      const variationClass =
                        Number.isNaN(variationNumber) || variationNumber === 0
                          ? 'neutral'
                          : variationNumber > 0
                          ? 'positive'
                          : 'negative';

                      return (
                        <tr key={row.metric || i}>
                          <td>{row.metric}</td>
                          <td className="col-num">{row.target?.toLocaleString()}</td>
                          <td className="col-num">{row.actualMTD?.toLocaleString()}</td>
                          <td className="col-num">
                            {row.actualExpected != null
                              ? row.actualExpected.toLocaleString()
                              : row.actualExp != null
                              ? row.actualExp.toLocaleString()
                              : '—'}
                          </td>
                          <td className={`col-num variation-cell variation-${variationClass}`}>
                            {typeof row.variation === 'number'
                              ? row.variation >= 0
                                ? `↑${row.variation.toFixed(1)}%`
                                : `↓${Math.abs(row.variation).toFixed(1)}%`
                              : row.variation || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="exec-top-stats">
            <button
              type="button"
              className="exec-stat-card kpi-green"
              onClick={() => openAsinModal('OPEN_POS')}
            >
              <div className="exec-stat-label">OPEN POS</div>
              <div className="exec-stat-value">
                {poSummary.openPOs != null ? poSummary.openPOs.toLocaleString() : '—'}
              </div>
            </button>
            <button
              type="button"
              className="exec-stat-card kpi-blue"
              onClick={() => openAsinModal('PO_RECEIVED')}
            >
              <div className="exec-stat-label">PO RECEIVED</div>
              <div className="exec-stat-value">
                {poSummary.poReceived != null ? poSummary.poReceived.toLocaleString() : '—'}
              </div>
            </button>
            <button
              type="button"
              className="exec-stat-card kpi-slate"
              onClick={() => openAsinModal('SKU_NO_BUYBOX')}
            >
              <div className="exec-stat-label">SKU WT NO BUYBOX</div>
              <div className="exec-stat-value">
                {poSummary.skuNoBuybox != null ? poSummary.skuNoBuybox.toLocaleString() : '—'}
              </div>
            </button>
          </div>
        </div>
      </section>

      <div className="exec-lower-row">
        <div
          className="card fade-in-up"
          style={{ animationDelay: '320ms', gridColumn: '1 / -1', minWidth: 0 }}
        >
          <div className="exec-deep-dive-header" style={{ marginBottom: '0.5rem' }}>
            <div>
              <h3>Deep dive your ASIN performance</h3>
              <p className="section-muted">
                Comparing <strong>{deepDiveMeta.currentLabel}</strong> to{' '}
                <strong>{deepDiveMeta.previousLabel}</strong>
              </p>
            </div>
          </div>

          <div className="deep-dive-tabs" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className={`deep-dive-tab ${activeDeepDiveTab === 'declining' ? 'active' : ''}`}
              onClick={() => setActiveDeepDiveTabAndResetPage('declining')}
            >
              Products with declining sales
            </button>
            <button
              type="button"
              className={`deep-dive-tab ${activeDeepDiveTab === 'increasing' ? 'active' : ''}`}
              onClick={() => setActiveDeepDiveTabAndResetPage('increasing')}
            >
              Products with increasing sales
            </button>
            <button
              type="button"
              className={`deep-dive-tab ${activeDeepDiveTab === 'top_selling' ? 'active' : ''}`}
              onClick={() => setActiveDeepDiveTabAndResetPage('top_selling')}
            >
              Top-selling products
            </button>
          </div>
          {revenueLoading ? (
            <div className="shimmer-block" style={{ minHeight: 200 }} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ASIN</th>
                      <th>Product Name</th>
                      <th className="col-num">Revenue ({deepDiveMeta.previousLabel})</th>
                      <th className="col-num">Revenue ({deepDiveMeta.currentLabel})</th>
                      <th className="col-num">Abs Diff</th>
                      <th className="col-num">% Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="text-secondary">{row.asin ?? '—'}</span></td>
                        <td>
                          <div className="cell-product">
                            <div className="table-thumb" aria-hidden>—</div>
                            <div>{row.productName ?? '—'}</div>
                          </div>
                        </td>
                        <td className="col-num">{formatAedRounded(row.previousRevenue)}</td>
                        <td className="col-num">{formatAedRounded(row.currentRevenue)}</td>
                        <td className="col-num">
                          {(() => {
                            const v = Number(row.absDiffRevenue) || 0;
                            if (v >= 0) return `↑${v.toLocaleString()}`;
                            return `↓${Math.abs(v).toLocaleString()}`;
                          })()}
                        </td>
                        <td className="col-num">
                          {row.pctChangeRevenue == null
                            ? ((Number(row.previousRevenue) || 0) === 0 && (Number(row.currentRevenue) || 0) > 0 ? 'New' : '—')
                            : row.pctChangeRevenue >= 0
                              ? `↑${row.pctChangeRevenue.toFixed(1)}%`
                              : `↓${Math.abs(row.pctChangeRevenue).toFixed(1)}%`}
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
            </>
          )}
        </div>
      </div>

      {asinModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setAsinModal({ open: false, title: '', rows: [] })}
        >
          <div
            className="modal modal-large"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{asinModal.title}</h3>
              <button
                type="button"
                className="btn-logout"
                onClick={() => setAsinModal({ open: false, title: '', rows: [] })}
              >
                Close
              </button>
            </div>
            <div className="table-wrap">
              {!Array.isArray(asinModal.rows) || asinModal.rows.length === 0 ? (
                <p className="section-muted">No ASINs found for this metric.</p>
              ) : (
                <table className="data-table">
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
                        <td>{row.productName ?? '—'}</td>
                        <td>{row.salesChannel ?? '—'}</td>
                        <td className="col-num">{Number(row.openPOs) || 0}</td>
                        <td className="col-num">{Number(row.poReceivedUnits) || 0}</td>
                        <td>{row.currentOwner ?? '—'}</td>
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
