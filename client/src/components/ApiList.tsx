import { useMemo, useState } from 'react';
import { getMethodClasses, getSourceClasses, getSourceKey } from '../lib/apiUtils';
import type { BuriedApi, NormalizedApi } from '../types';

interface ApiListProps {
  apis: BuriedApi[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function ApiList({ apis, selectedId, onSelect }: ApiListProps) {
  const [query, setQuery] = useState('');
  const normalizedApis = apis as NormalizedApi[];

  const filteredApis = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return normalizedApis;
    }

    return normalizedApis.filter((api) => [api.method, api.path, api.source, api.confidence].join(' ').toLowerCase().includes(needle));
  }, [normalizedApis, query]);

  const groupedApis = useMemo(() => groupBySource(filteredApis), [filteredApis]);

  return (
    <aside className="flex h-full flex-col" aria-label="Discovered APIs">
      <div className="border-b border-terminal-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="terminal-label">Left Panel</p>
            <h3 className="mt-2 text-lg font-bold text-terminal-text">Discovered APIs</h3>
          </div>
          <span className="rounded border border-terminal-green/50 bg-terminal-selected px-3 py-1 text-sm text-terminal-green">{filteredApis.length}</span>
        </div>
        <label className="mt-4 grid gap-2">
          <span className="text-xs uppercase tracking-[0.16em] text-terminal-muted">Filter endpoints</span>
          <input className="terminal-input py-2" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="method, path, source..." />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {groupedApis.length > 0 ? (
          <div className="grid gap-5">
            {groupedApis.map(([source, sourceApis]) => (
              <section className="grid gap-2" key={source}>
                <div className="flex items-center justify-between text-xs text-terminal-muted">
                  <span className={`rounded border px-2 py-1 uppercase tracking-[0.12em] ${getSourceClasses(source)}`}>{source}</span>
                  <span>{sourceApis.length}</span>
                </div>
                <div className="grid gap-2">
                  {sourceApis.map((api) => (
                    <button
                      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border p-3 text-left transition hover:border-terminal-green hover:bg-terminal-hover ${
                        api.id === selectedId ? 'border-terminal-green bg-terminal-selected' : 'border-terminal-border bg-terminal-bg/40'
                      }`}
                      key={api.id}
                      type="button"
                      onClick={() => onSelect(api.id)}
                    >
                      <span className={`rounded border px-2 py-1 text-[0.6875rem] font-bold ${getMethodClasses(api.method)}`}>{api.method}</span>
                      <span className="truncate text-sm text-terminal-text">{api.path}</span>
                      <span className={`rounded border px-2 py-1 text-[0.625rem] uppercase ${getSourceClasses(api.source)}`}>{getSourceKey(api.source)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-terminal-border p-4 text-sm text-terminal-muted">
            <p className="text-terminal-text">No matching APIs</p>
            <p className="mt-2">Adjust the filter to inspect captured endpoints.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function groupBySource(apis: NormalizedApi[]): Array<[string, NormalizedApi[]]> {
  const groups = new Map<string, NormalizedApi[]>();

  for (const api of apis) {
    const source = getSourceKey(api.source);
    const sourceApis = groups.get(source) || [];
    sourceApis.push(api);
    groups.set(source, sourceApis);
  }

  return Array.from(groups.entries());
}
