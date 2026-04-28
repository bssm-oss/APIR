import { useMemo, useState } from 'react';
import ApiDetail from './ApiDetail.jsx';
import ApiList from './ApiList.jsx';
import ExportButtons from './ExportButtons.jsx';
import ReportHeader from './ReportHeader.jsx';
import { createCurlCommand, normalizeApis } from '../lib/reportUtils.js';

export default function Dashboard() {
  const [targetUrl, setTargetUrl] = useState('');
  const [report, setReport] = useState(null);
  const [selectedApiId, setSelectedApiId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const apis = useMemo(() => normalizeApis(report), [report]);
  const selectedApi = useMemo(
    () => apis.find((api) => api.id === selectedApiId) ?? apis[0] ?? null,
    [apis, selectedApiId]
  );

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedTarget = targetUrl.trim();
    if (!trimmedTarget) {
      setError('Enter a target URL before launching a scan.');
      return;
    }

    setIsLoading(true);
    setError('');
    setReport(null);
    setSelectedApiId('');

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: trimmedTarget }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message || `Scan failed with HTTP ${response.status}`);
      }

      const nextReport = await response.json();
      const nextApis = normalizeApis(nextReport);

      setReport(nextReport);
      setSelectedApiId(nextApis[0]?.id ?? '');
    } catch (scanError) {
      setError(scanError.message || 'The scan failed unexpectedly.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="dashboard-title">
        <div className="hero-copy">
          <span className="eyebrow">APIR Recon Console</span>
          <h1 id="dashboard-title">Expose buried API surfaces before attackers do.</h1>
          <p>
            Run a passive scan, group discovered endpoints by origin, and export a terminal-ready
            investigation brief.
          </p>
        </div>

        <form className="scan-form" onSubmit={handleSubmit}>
          <label htmlFor="target-url">Target URL</label>
          <div className="scan-control">
            <input
              id="target-url"
              type="url"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://example.com"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Scanning' : 'Scan'}
            </button>
          </div>
        </form>
      </section>

      {isLoading && <LoadingConsole targetUrl={targetUrl} />}

      {error && (
        <section className="status-card status-card--error" role="alert">
          <span>scan:error</span>
          <p>{error}</p>
        </section>
      )}

      {report && (
        <section className="dashboard-grid" aria-label="Scan results dashboard">
          <div className="dashboard-toolbar">
            <ReportHeader report={report} totalApis={apis.length} />
            <ExportButtons
              report={report}
              apis={apis}
              selectedApi={selectedApi}
              curlCommand={selectedApi ? createCurlCommand(selectedApi, report.target) : ''}
            />
          </div>

          <div className="panel-layout">
            <ApiList apis={apis} selectedApiId={selectedApi?.id} onSelect={setSelectedApiId} />
            <ApiDetail api={selectedApi} target={report.target} />
          </div>
        </section>
      )}

      {!report && !isLoading && !error && (
        <section className="empty-console" aria-label="Awaiting scan">
          <span className="terminal-prompt">$ apir scan --target</span>
          <p>Enter a URL to build a grouped endpoint map with source confidence and cURL samples.</p>
        </section>
      )}
    </main>
  );
}

async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    return payload.error || payload.message || '';
  } catch {
    return response.statusText;
  }
}

function LoadingConsole({ targetUrl }) {
  return (
    <section className="loading-console" aria-live="polite" aria-label="Scan in progress">
      <div className="loading-line">
        <span className="terminal-prompt">$ apir scan</span>
        <span>{targetUrl || 'target'}</span>
      </div>
      <div className="loading-line loading-line--muted">
        <span>collecting sourcemaps</span>
        <span>window globals</span>
        <span>phantom routes</span>
      </div>
      <div className="terminal-loader">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
