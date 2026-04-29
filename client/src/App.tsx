import { useEffect, useMemo, useRef, useState } from 'react';
import ExportButtons from './components/ExportButtons';
import ReportViewer from './components/ReportViewer';
import ScanProgress from './components/ScanProgress';
import UrlInput from './components/UrlInput';
import { PHASES, normalizeReportApis } from './lib/apiUtils';
import type { ScanOptions, ScanResponse } from './types';

const PHASE_LABELS = ['boot', ...PHASES, 'report'];

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [report, setReport] = useState<ScanResponse | null>(null);
  const [error, setError] = useState('');
  const [currentPhase, setCurrentPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<number | null>(null);

  const discoveredApis = useMemo(() => normalizeReportApis(report), [report]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
      }
    };
  }, []);

  async function handleScan(url: string, options: ScanOptions) {
    const targetUrl = url.trim();

    if (!targetUrl) {
      setError('Enter a target URL before launching a scan.');
      return;
    }

    setIsScanning(true);
    setReport(null);
    setError('');
    setProgress(5);
    setCurrentPhase('boot');
    startProgressLoop();

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, options }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message || `Scan failed with HTTP ${response.status}`);
      }

      const nextReport = (await response.json()) as ScanResponse;
      setReport(nextReport);
      setCurrentPhase('report');
      setProgress(100);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'The scan failed unexpectedly.');
      setCurrentPhase('error');
    } finally {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }

      setIsScanning(false);
    }
  }

  function startProgressLoop() {
    if (progressTimer.current) {
      window.clearInterval(progressTimer.current);
    }

    let tick = 0;
    progressTimer.current = window.setInterval(() => {
      tick += 1;
      const phaseIndex = Math.min(Math.floor(tick / 3), PHASE_LABELS.length - 2);
      setCurrentPhase(PHASE_LABELS[phaseIndex]);
      setProgress((value) => Math.min(value + (value < 55 ? 7 : 3), 92));
    }, 900);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-terminal-bg px-4 py-6 font-mono text-terminal-text sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-x-0 top-0 h-px bg-terminal-green/50" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:100%_4px]" />
        <div className="absolute inset-x-0 top-0 h-32 animate-scanline bg-gradient-to-b from-transparent via-terminal-green/5 to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="terminal-panel rounded-lg p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="terminal-label">APIR Recon Console</p>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.04em] text-terminal-text sm:text-5xl">
                Map exposed and buried API surfaces from a single authorized target.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-terminal-muted sm:text-base">
                A passive terminal dashboard for Source Map, runtime, metadata, GraphQL, Service Worker, and Phantom Flow findings.
              </p>
            </div>
            <div className="rounded border border-terminal-green/40 bg-terminal-selected px-4 py-3 text-sm text-terminal-green shadow-glow">
              <span className="mr-2">$</span> apir scan --dashboard<span className="ml-1 inline-block h-4 w-2 animate-blink bg-terminal-green align-[-0.2rem]" />
            </div>
          </div>
        </header>

        {!isScanning && <UrlInput onScan={handleScan} />}

        {isScanning && <ScanProgress currentPhase={currentPhase} isScanning={isScanning} progress={progress} />}

        {error && (
          <section className="terminal-panel rounded-lg border-terminal-red/60 p-5" role="alert">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-terminal-red">scan:error</p>
            <p className="mt-3 text-sm leading-6 text-terminal-text">{error}</p>
          </section>
        )}

        {report && (
          <section className="flex flex-col gap-4" aria-label="Scan report">
            <div className="terminal-panel flex flex-col gap-4 rounded-lg p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="terminal-label">Scan Report</p>
                <h2 className="mt-2 break-all text-xl font-bold text-terminal-text">{report.target}</h2>
                <p className="mt-2 text-sm text-terminal-muted">
                  {new Date(report.scanTime).toLocaleString()} / {discoveredApis.length} endpoints / risk {Number(report.riskScore || 0)}/100
                </p>
              </div>
              <ExportButtons report={report} />
            </div>
            <ReportViewer report={report} />
          </section>
        )}

        {!report && !isScanning && !error && (
          <section className="terminal-panel rounded-lg border-dashed p-5 text-sm text-terminal-muted">
            <p className="text-terminal-green">$ waiting_for_target</p>
            <p className="mt-3 leading-6">Enter an authorized URL to generate a structured endpoint dossier.</p>
          </section>
        )}
      </div>
    </main>
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error || payload.message || '';
  } catch {
    return response.statusText;
  }
}
