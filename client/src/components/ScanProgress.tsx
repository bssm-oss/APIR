interface ScanProgressProps {
  isScanning: boolean;
  currentPhase: string;
  progress: number;
}

export default function ScanProgress({ isScanning, currentPhase, progress }: ScanProgressProps) {
  return (
    <section className="terminal-panel rounded-lg p-5" aria-live="polite" aria-label="Scan progress">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="terminal-label">Scan Progress</p>
            <p className="mt-2 text-sm text-terminal-text">
              $ running_phase --name <span className="text-terminal-green">{currentPhase}</span>
              {isScanning && <span className="ml-1 inline-block h-4 w-2 animate-blink bg-terminal-green align-[-0.2rem]" />}
            </p>
          </div>
          <span className="rounded border border-terminal-green/50 bg-terminal-selected px-3 py-1 text-sm text-terminal-green">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded border border-terminal-border bg-terminal-bg">
          <div className="h-full bg-terminal-green shadow-glow transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
