import { useMemo, useState } from 'react';
import ApiDetail from './ApiDetail';
import ApiList from './ApiList';
import { normalizeReportApis } from '../lib/apiUtils';
import type { NormalizedApi, ScanResponse } from '../types';

interface ReportViewerProps {
  report: ScanResponse;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const apis = useMemo(() => normalizeReportApis(report), [report]);
  const [selectedId, setSelectedId] = useState(() => apis[0]?.id || '');
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const selectedApi = useMemo<NormalizedApi | undefined>(() => apis.find((api) => api.id === selectedId) || apis[0], [apis, selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setViewMode('detail');
  }

  return (
    <div className="terminal-panel overflow-hidden rounded-lg">
      <div className="flex border-b border-terminal-border lg:hidden">
        <button
          className={`flex-1 px-4 py-3 text-sm ${viewMode === 'list' ? 'bg-terminal-selected text-terminal-green' : 'text-terminal-muted'}`}
          type="button"
          onClick={() => setViewMode('list')}
        >
          API List
        </button>
        <button
          className={`flex-1 px-4 py-3 text-sm ${viewMode === 'detail' ? 'bg-terminal-selected text-terminal-green' : 'text-terminal-muted'}`}
          type="button"
          onClick={() => setViewMode('detail')}
        >
          Detail
        </button>
      </div>
      <div className="grid min-h-[40rem] lg:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.25fr)]">
        <div className={viewMode === 'detail' ? 'hidden lg:block' : 'block'}>
          <ApiList apis={apis} selectedId={selectedApi?.id || ''} onSelect={handleSelect} />
        </div>
        <div className={viewMode === 'list' ? 'hidden border-l border-terminal-border lg:block' : 'block border-l border-terminal-border'}>
          <ApiDetail api={selectedApi} target={report.target} />
        </div>
      </div>
    </div>
  );
}
