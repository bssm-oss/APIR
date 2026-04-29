import { useState } from 'react';
import { createMarkdownReport, safeJson, sanitizeFileName } from '../lib/apiUtils';
import type { ScanResponse } from '../types';

interface ExportButtonsProps {
  report: ScanResponse;
}

export default function ExportButtons({ report }: ExportButtonsProps) {
  const [copyState, setCopyState] = useState('Copy as JSON');
  const target = report.target || 'apir-scan';

  function handleExportMarkdown() {
    const markdown = createMarkdownReport(target, report.surfaceApis ?? [], report.buriedApis ?? []);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${sanitizeFileName(target)}-findings.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const blob = new Blob([safeJson(report)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${sanitizeFileName(target)}-report.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCopyJson() {
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy as JSON'), 1400);

    try {
      await copyText(safeJson(report));
    } catch {
      setCopyState('Copy failed');
      window.setTimeout(() => setCopyState('Copy as JSON'), 1400);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="Report actions">
      <button className="terminal-button terminal-button-primary" type="button" onClick={handleExportMarkdown}>
        Export as Markdown
      </button>
      <button className="terminal-button" type="button" onClick={handleExportJson}>
        Download JSON
      </button>
      <button className="terminal-button" type="button" onClick={handleCopyJson}>
        {copyState}
      </button>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
    }
  }
}
