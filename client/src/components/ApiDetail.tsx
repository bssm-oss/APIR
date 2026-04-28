import { useState } from 'react';
import { createCurlCommand, formatValue, getMethodClasses, getSourceClasses, safeJson } from '../lib/apiUtils';
import type { BuriedApi, NormalizedApi } from '../types';

interface ApiDetailProps {
  api?: BuriedApi;
  target: string;
}

export default function ApiDetail({ api, target }: ApiDetailProps) {
  const [copyState, setCopyState] = useState('Copy as cURL');

  if (!api) {
    return (
      <section className="grid h-full place-items-center p-6" aria-label="API details">
        <div className="rounded border border-dashed border-terminal-border p-6 text-center text-sm text-terminal-muted">
          <p className="text-terminal-text">No endpoint selected</p>
          <p className="mt-2">Choose an API from the list to inspect request details and evidence.</p>
        </div>
      </section>
    );
  }

  const normalizedApi = api as NormalizedApi;
  const curlCommand = createCurlCommand(api, target);
  const sources = api.sources?.length ? api.sources : [api.source];

  async function handleCopyCurl() {
    await copyText(curlCommand);
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy as cURL'), 1400);
  }

  return (
    <section className="h-full overflow-y-auto p-5" aria-label="Selected API details">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="terminal-label">Right Panel</p>
          <h3 className="mt-2 break-all text-2xl font-bold leading-tight text-terminal-text">{api.path}</h3>
        </div>
        <span className={`w-fit rounded border px-3 py-1 text-xs uppercase tracking-[0.12em] ${getSourceClasses(api.source)}`}>{api.source}</span>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <DetailItem label="HTTP method" value={api.method} toneClass={getMethodClasses(api.method)} />
        <DetailItem label="Confidence" value={api.confidence} />
        <DetailItem label="Source" value={api.source} toneClass={getSourceClasses(api.source)} />
        <DetailItem label="Category" value={normalizedApi.category || 'buried'} />
        <DetailItem label="Found in" value={formatValue(api.foundIn)} wide />
      </dl>

      <div className="mt-6 rounded border border-terminal-border bg-terminal-bg/70">
        <div className="flex items-center justify-between gap-3 border-b border-terminal-border px-4 py-3">
          <span className="terminal-label">sample request</span>
          <button className="terminal-button py-1 text-xs" type="button" onClick={handleCopyCurl}>
            {copyState}
          </button>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-6 text-terminal-text">{curlCommand}</pre>
      </div>

      <div className="mt-6 grid gap-4">
        <section className="rounded border border-terminal-border bg-terminal-bg/60 p-4">
          <p className="terminal-label">all sources</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((source) => (
              <span className={`rounded border px-2 py-1 text-xs uppercase ${getSourceClasses(source)}`} key={source}>
                {source}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded border border-terminal-border bg-terminal-bg/60 p-4">
          <p className="terminal-label">evidence</p>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-sm leading-6 text-terminal-muted">
            {api.evidence ? safeJson(api.evidence) : api.note || 'No evidence payload was attached to this endpoint.'}
          </pre>
        </section>
      </div>
    </section>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  toneClass?: string;
  wide?: boolean;
}

function DetailItem({ label, value, toneClass = 'border-terminal-border text-terminal-text bg-terminal-card', wide = false }: DetailItemProps) {
  return (
    <div className={`rounded border border-terminal-border bg-terminal-card/70 p-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs uppercase tracking-[0.16em] text-terminal-muted">{label}</dt>
      <dd className={`mt-2 break-words rounded border px-2 py-1 text-sm ${toneClass}`}>{value}</dd>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}
