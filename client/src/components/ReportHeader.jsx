export default function ReportHeader({ report, totalApis }) {
  const scanTime = report.scanTime ? new Date(report.scanTime).toLocaleString() : 'Unknown';
  const riskScoreValue = Number(report.riskScore);
  const riskScore = Number.isFinite(riskScoreValue) ? riskScoreValue : 0;

  return (
    <header className="report-header">
      <div>
        <span className="eyebrow">Scan Report</span>
        <h2>{report.target || 'Untitled target'}</h2>
      </div>

      <dl className="summary-grid">
        <SummaryItem label="Scan time" value={scanTime} />
        <SummaryItem label="Risk score" value={`${riskScore}/100`} tone={getRiskTone(riskScore)} />
        <SummaryItem label="APIs found" value={totalApis} />
      </dl>
    </header>
  );
}

function SummaryItem({ label, value, tone = 'neutral' }) {
  return (
    <div className={`summary-card summary-card--${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getRiskTone(score) {
  if (score >= 70) {
    return 'high';
  }

  if (score >= 35) {
    return 'medium';
  }

  return 'low';
}
