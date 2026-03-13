import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep console visibility for debugging in dev
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: '1rem' }}>
        <div className="auth-error" style={{ marginBottom: '0.75rem' }}>
          {this.props.fallbackTitle || 'Something went wrong rendering this page.'}
        </div>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            background: 'rgba(15, 23, 42, 0.04)',
            border: '1px solid rgba(15, 23, 42, 0.08)',
            borderRadius: 12,
            padding: '0.75rem',
            fontSize: '0.85rem',
            color: '#0f172a',
            overflowX: 'auto',
          }}
        >
          {String(error?.stack || error?.message || error)}
        </pre>
      </div>
    );
  }
}

