import { useState } from 'react';
import { createMarkdownReport, safeJson, sanitizeFileName } from '../lib/apiUtils';
import type { Api, BuriedApi } from '../types';

interface ExportButtonsProps {
  apis: BuriedApi[];
  surfaceApis: Api[];
  target?: string;
}

export default function ExportButtons({ apis, surfaceApis, target = 'apir-scan' }: ExportButtonsProps) {
  const [copyState, setCopyState] = useState('Copy as JSON');

  function handleExportMarkdown() {
    const markdown = createMarkdownReport(target, surfaceApis, apis);
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

  async function handleCopyJson() {
    await copyText(safeJson({ target, buriedApis: apis, surfaceApis }));
    setCopyState('Copied');
    window.setTimeout(() => setCopyState('Copy as JSON'), 1400);
  }

  return (
    <div className="flex flex-wrap gap-2" aria-label="Report actions">
      <button className="terminal-button terminal-button-primary" type="button" onClick={handleExportMarkdown}>
        Export as Markdown
      </button>
      <button className="terminal-button" type="button" onClick={handleCopyJson}>
        {copyState}
      </button>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
  }
}
