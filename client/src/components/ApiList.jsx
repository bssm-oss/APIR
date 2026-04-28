import { useMemo, useState } from 'react';
import { SOURCE_META, METHOD_META, getSourceKey } from '../lib/reportUtils.js';

export default function ApiList({ apis, selectedApiId, onSelect }) {
  const [query, setQuery] = useState('');

  const filteredApis = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return apis;
    }

    return apis.filter((api) => {
      const haystack = [api.method, api.path, api.source, api.foundIn, api.confidence]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [apis, query]);

  const groupedApis = useMemo(() => groupBySource(filteredApis), [filteredApis]);

  return (
    <aside className="api-list-panel" aria-label="Discovered APIs">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Left Panel</span>
          <h3>Discovered APIs</h3>
        </div>
        <span className="count-pill">{filteredApis.length}</span>
      </div>

      <label className="filter-box">
        <span>Filter endpoints</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="method, path, source..."
        />
      </label>

      <div className="api-groups">
        {groupedApis.map(([sourceKey, sourceApis]) => {
          const sourceMeta = SOURCE_META[sourceKey] ?? SOURCE_META.unknown;

          return (
            <section className="api-group" key={sourceKey}>
              <div className="api-group-heading">
                <span className={`source-badge source-badge--${sourceKey}`}>{sourceMeta.label}</span>
                <span>{sourceApis.length}</span>
              </div>

              <div className="api-items">
                {sourceApis.map((api) => (
                  <button
                    className={`api-item${api.id === selectedApiId ? ' api-item--active' : ''}`}
                    key={api.id}
                    type="button"
                    onClick={() => onSelect(api.id)}
                  >
                    <span className={`method-badge method-badge--${getMethodKey(api.method)}`}>
                      {api.method}
                    </span>
                    <span className="api-path">{api.path}</span>
                    <span className={`source-badge source-badge--${sourceKey} api-source-tag`}>
                      {sourceMeta.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {filteredApis.length === 0 && (
          <div className="empty-state">
            <span>No matching APIs</span>
            <p>Adjust the filter to inspect captured endpoints.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function groupBySource(apis) {
  const groups = new Map();

  for (const api of apis) {
    const sourceKey = getSourceKey(api.source);

    if (!groups.has(sourceKey)) {
      groups.set(sourceKey, []);
    }

    groups.get(sourceKey).push(api);
  }

  return Array.from(groups.entries());
}

function getMethodKey(method) {
  const key = String(method || 'UNKNOWN').toLowerCase();
  return METHOD_META[key] ? key : 'unknown';
}
