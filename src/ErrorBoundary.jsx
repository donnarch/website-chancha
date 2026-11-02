import React from 'react';

// If anything ever crashes, show a readable message instead of a blank screen.
export default class ErrorBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('UI crash:', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '60px auto', color: '#0f172a' }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong / 문제가 발생했습니다</h2>
        <p style={{ color: '#475569', marginBottom: 12 }}>
          If your browser offered to translate this page, choose "Never translate" — translation breaks the dashboard.
          <br />
          브라우저의 "페이지 번역" 기능을 끄고 새로고침해주세요.
        </p>
        <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '10px 18px', background: '#0369a1', color: '#fff', border: 0, borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>
          Reload / 새로고침
        </button>
      </div>
    );
  }
}
