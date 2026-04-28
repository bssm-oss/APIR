import { FormEvent, useMemo, useState } from 'react';
import { PHASES, QUICK_PHASES } from '../lib/apiUtils';
import type { ScanOptions } from '../types';

interface UrlInputProps {
  onScan: (url: string, options: ScanOptions) => void;
}

export default function UrlInput({ onScan }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [showPhaseSelector, setShowPhaseSelector] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<Set<string>>(() => new Set(PHASES));

  const skippedPhases = useMemo(() => PHASES.filter((phase) => !selectedPhases.has(phase)), [selectedPhases]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onScan(url, { skipPhases: skippedPhases });
  }

  function handleQuickScan() {
    const quickPhases = new Set(QUICK_PHASES);
    setSelectedPhases(quickPhases);
    onScan(url, {
      quick: true,
      skipPhases: PHASES.filter((phase) => !quickPhases.has(phase)),
    });
  }

  function togglePhase(phase: string) {
    setSelectedPhases((current) => {
      const next = new Set(current);

      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }

      return next;
    });
  }

  function selectAllPhases() {
    setSelectedPhases(new Set(PHASES));
  }

  return (
    <section className="terminal-panel rounded-lg p-5 sm:p-6" aria-label="Scan target">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-3">
          <label className="terminal-label" htmlFor="target-url">
            Target URL
          </label>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              className="terminal-input"
              id="target-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
            <button className="terminal-button terminal-button-primary" type="submit">
              Scan Target
            </button>
            <button className="terminal-button" type="button" onClick={handleQuickScan}>
              Quick Scan
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-terminal-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button className="terminal-button w-full sm:w-auto" type="button" onClick={() => setShowPhaseSelector((value) => !value)}>
              {showPhaseSelector ? 'Hide Phase Selector' : 'Show Phase Selector'}
            </button>
            <p className="text-xs uppercase tracking-[0.16em] text-terminal-muted">
              {selectedPhases.size}/{PHASES.length} phases armed
            </p>
          </div>

          {showPhaseSelector && (
            <div className="grid gap-3 rounded border border-terminal-border bg-terminal-bg/50 p-4">
              <div className="flex flex-wrap gap-2">
                {PHASES.map((phase) => {
                  const isSelected = selectedPhases.has(phase);

                  return (
                    <button
                      className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                        isSelected
                          ? 'border-terminal-green bg-terminal-selected text-terminal-green'
                          : 'border-terminal-border bg-terminal-card text-terminal-muted hover:border-terminal-green hover:bg-terminal-hover hover:text-terminal-text'
                      }`}
                      key={phase}
                      type="button"
                      onClick={() => togglePhase(phase)}
                    >
                      {phase}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="terminal-button" type="button" onClick={selectAllPhases}>
                  Select All
                </button>
                <button className="terminal-button" type="button" onClick={() => setSelectedPhases(new Set(QUICK_PHASES))}>
                  Quick Preset
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
