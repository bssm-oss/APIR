import { createCurlCommand, getNotes, getSourceKey } from '../lib/reportUtils.js';

export default function ApiDetail({ api, target }) {
  if (!api) {
    return (
      <section className="api-detail-panel" aria-label="API details">
        <div className="empty-state empty-state--large">
          <span>No endpoint selected</span>
          <p>Choose an API from the left panel to inspect request details and source evidence.</p>
        </div>
      </section>
    );
  }

  const curlCommand = createCurlCommand(api, target);
  const notes = getNotes(api);
  const sourceKey = getSourceKey(api.source);

  return (
    <section className="api-detail-panel" aria-label="Selected API details">
      <div className="detail-heading">
        <div>
          <span className="eyebrow">Right Panel</span>
          <h3>{api.path}</h3>
        </div>
        <span className={`source-badge source-badge--${sourceKey}`}>{api.source}</span>
      </div>

      <dl className="detail-grid">
        <DetailItem label="HTTP method" value={api.method} />
        <DetailItem label="Confidence" value={api.confidence || 'unknown'} />
        <DetailItem label="Source" value={api.source || 'unknown'} />
        <DetailItem label="Found in" value={api.foundIn || api.evidence || 'not reported'} />
      </dl>

      <div className="code-block">
        <div className="code-block-heading">
          <span>sample request</span>
          <span>curl</span>
        </div>
        <pre>{curlCommand}</pre>
      </div>

      <div className="notes-panel">
        <span>Notes</span>
        {notes.length > 0 ? (
          <ul>
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p>No notes or source comments were attached to this endpoint.</p>
        )}
      </div>
    </section>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="detail-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
