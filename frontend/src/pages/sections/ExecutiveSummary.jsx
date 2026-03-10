import { useState, useEffect } from 'react';
import { dashboardApi } from '../../api/api';

const COLOR_CLASSES = ['kpi-blue', 'kpi-green', 'kpi-amber', 'kpi-violet', 'kpi-rose', 'kpi-slate'];

const DEFAULT_DEEP_DIVE_TABS = [
  { key: 'declining', label: 'Products with declining sales' },
  { key: 'increasing', label: 'Products with increasing sales' },
  { key: 'traffic', label: 'Declining traffic products' },
  { key: 'top_selling', label: 'Top-selling products' },
];

const DEFAULT_DEEP_DIVE_PERIODS = [
  { key: 'prior_week', label: 'Prior week' },
  { key: 'current_week', label: 'Current week' },
];

const DEFAULT_DEEP_DIVE_ITEMS = [
  {
    asin: 'B0DEMO001',
    title: 'Kinetica Sports OatGain...',
    description: 'This ASIN observed £945.15 decline in OPS',
    change: '',
    ctaLabel: 'View details',
    period: 'Prior week',
  },
  {
    asin: 'B0DEMO002',
    title: 'Kinetica Sports Creapure...',
    description: 'This ASIN observed £872.56 decline in OPS',
    change: '',
    ctaLabel: 'View details',
    period: 'Prior week',
  },
  {
    asin: 'B0DEMO003',
    title: 'Kinetica Sports Whey Pro...',
    description: 'This ASIN observed £508.64 decline in OPS',
    change: '',
    ctaLabel: 'View details',
    period: 'Prior week',
  },
];

export default function ExecutiveSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeDeepDiveTab, setActiveDeepDiveTab] = useState('');
  const [activeDeepDivePeriod, setActiveDeepDivePeriod] = useState('prior_week');

  useEffect(() => {
    dashboardApi
      .getExecutiveSummary()
      .then((payload) => {
        setData(payload);
        if (payload?.deepDiveTabs?.length && !activeDeepDiveTab) {
          setActiveDeepDiveTab(payload.deepDiveTabs[0].key || payload.deepDiveTabs[0].label);
        }
        if (payload?.deepDivePeriods?.length && !activeDeepDivePeriod) {
          setActiveDeepDivePeriod(
            payload.deepDivePeriods[0].key || payload.deepDivePeriods[0].label,
          );
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeDeepDiveTab, activeDeepDivePeriod]);

  if (loading) {
    return (
      <div className="exec-summary">
        <div className="exec-loading shimmer-block" />
      </div>
    );
  }

  if (error) return <div className="auth-error">{error}</div>;
  if (!data) return null;

  const deepDiveTabs =
    Array.isArray(data.deepDiveTabs) && data.deepDiveTabs.length
      ? data.deepDiveTabs
      : DEFAULT_DEEP_DIVE_TABS;

  const deepDivePeriods =
    Array.isArray(data.deepDivePeriods) && data.deepDivePeriods.length
      ? data.deepDivePeriods
      : DEFAULT_DEEP_DIVE_PERIODS;
  const activeTabConfig =
    deepDiveTabs.find((t) => t.key === activeDeepDiveTab || t.label === activeDeepDiveTab) || null;
  const baseDeepDiveItems =
    (activeTabConfig?.items && activeTabConfig.items.length
      ? activeTabConfig.items
      : data.deepDiveItems && data.deepDiveItems.length
      ? data.deepDiveItems
      : DEFAULT_DEEP_DIVE_ITEMS) || [];
  const deepDiveItems =
    activeDeepDivePeriod && baseDeepDiveItems.length
      ? baseDeepDiveItems.filter(
          (item) =>
            !item.periodKey ||
            item.periodKey === activeDeepDivePeriod ||
            item.period === activeDeepDivePeriod,
        )
      : baseDeepDiveItems;

  const poSummary = data.poSummary || {};

  return (
    <div className="exec-summary">
      <header className="exec-header-row fade-in-up">
        <div className="exec-header-right">
          <button type="button" className="exec-month-select">
            {data.monthRange || 'Current Month'}
          </button>
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
                    {data.kpis?.map((row, i) => {
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
                              ? `${row.variation.toFixed(1)}%`
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
            <div className="exec-stat-card kpi-blue">
              <div className="exec-stat-label">PO RECEIVED</div>
              <div className="exec-stat-value">
                {poSummary.poReceived != null ? poSummary.poReceived.toLocaleString() : '—'}
              </div>
              {poSummary.poReceivedBase != null && (
                <div className="exec-stat-sub">AED {poSummary.poReceivedBase.toLocaleString()}</div>
              )}
            </div>
            <div className="exec-stat-card kpi-green">
              <div className="exec-stat-label">OPEN POS</div>
              <div className="exec-stat-value">
                {poSummary.openPOs != null ? poSummary.openPOs.toLocaleString() : '—'}
              </div>
              {poSummary.openPOsBase != null && (
                <div className="exec-stat-sub">AED {poSummary.openPOsBase.toLocaleString()}</div>
              )}
            </div>
            <div className="exec-stat-card kpi-amber">
              <div className="exec-stat-label">SCHEDULED POS</div>
              <div className="exec-stat-value">
                {poSummary.scheduledPOs != null ? poSummary.scheduledPOs.toLocaleString() : '—'}
              </div>
              {poSummary.scheduledPOsBase != null && (
                <div className="exec-stat-sub">
                  AED {poSummary.scheduledPOsBase.toLocaleString()}
                </div>
              )}
            </div>
            <div className="exec-stat-card kpi-slate">
              <div className="exec-stat-label">SKU WT NO BUYBOX</div>
              <div className="exec-stat-value">
                {poSummary.skuNoBuybox != null ? poSummary.skuNoBuybox.toLocaleString() : '—'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="exec-lower-row">
        <div className="card exec-deep-dive fade-in-up" style={{ animationDelay: '320ms' }}>
          <div className="exec-deep-dive-header">
            <div>
              <h3>Deep dive your ASIN performance</h3>
              {data.deepDiveSubtitle && (
                <p className="section-muted">{data.deepDiveSubtitle}</p>
              )}
            </div>
            <div className="exec-deep-dive-controls">
              {deepDivePeriods.length > 0 && (
                <select
                  className="deep-dive-period-select"
                  value={activeDeepDivePeriod}
                  onChange={(e) => setActiveDeepDivePeriod(e.target.value)}
                >
                  {deepDivePeriods.map((p) => {
                    const key = p.key || p.label;
                    return (
                      <option key={key} value={key}>
                        {p.label || key}
                      </option>
                    );
                  })}
                </select>
              )}
              <button type="button" className="btn-link-muted">
                Hide ASINs
              </button>
            </div>
          </div>

          {deepDiveTabs.length > 0 && (
            <div className="deep-dive-tabs">
              {deepDiveTabs.map((tab) => {
                const key = tab.key || tab.label;
                const isActive = key === activeDeepDiveTab;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`deep-dive-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveDeepDiveTab(key)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="deep-dive-cards">
            {deepDiveItems.map((item, i) => (
              <article
                key={item.asin || i}
                className="deep-dive-card fade-in-up"
                style={{ animationDelay: `${80 * (i + 1)}ms` }}
              >
                <header className="deep-dive-card-header">
                  <div className="deep-dive-title-block">
                    <div className="table-thumb">{item.thumbText || item.asin || 'ASIN'}</div>
                    <div>
                      <div className="deep-dive-title">{item.title}</div>
                      {item.asin && <div className="deep-dive-subtitle">{item.asin}</div>}
                    </div>
                  </div>
                  {item.badge && (
                    <span className={`badge ${item.badgeClass || 'badge-critical'}`}>
                      {item.badge}
                    </span>
                  )}
                </header>
                {item.description && (
                  <p className="deep-dive-description">{item.description}</p>
                )}
                {item.change && <div className="deep-dive-change">{item.change}</div>}
                <footer className="deep-dive-footer">
                  <button type="button" className="btn-primary-soft">
                    {item.ctaLabel || 'View details'}
                  </button>
                  {item.period && <span className="deep-dive-period">{item.period}</span>}
                </footer>
              </article>
            ))}
          </div>
        </div>

        <aside className="card exec-vc-card fade-in-up" style={{ animationDelay: '360ms' }}>
          <h3>Add details for the following (VC only)</h3>
          <ol className="exec-vc-list">
            <li>Buybox</li>
            <li>Low Stock</li>
            <li>Out of Stock</li>
          </ol>
          <button type="button" className="btn-primary-soft exec-vc-btn">
            Show last 30 Days sales
          </button>
        </aside>
      </div>
    </div>
  );
}
