import { createMarkdownReport } from '../lib/reportUtils.js';

export default function ExportButtons({ report, apis, selectedApi, curlCommand }) {
  async function handleCopyCurl() {
    if (!curlCommand) {
      return;
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(curlCommand);
      return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = curlCommand;
    textArea.setAttribute('readonly', '');
    document.body.append(textArea);
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }

  function handleExportMarkdown() {
    const markdown = createMarkdownReport(report, apis);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const targetName = sanitizeFileName(report.target || 'apir-scan');

    anchor.href = url;
    anchor.download = `${targetName}-findings.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="export-actions" aria-label="Report actions">
      <button type="button" onClick={handleExportMarkdown}>
        Export as Markdown
      </button>
      <button type="button" onClick={handleCopyCurl} disabled={!selectedApi}>
        Copy as cURL
      </button>
    </div>
  );
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
