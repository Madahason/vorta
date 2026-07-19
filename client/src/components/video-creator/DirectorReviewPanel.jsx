import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Info, RefreshCw } from 'lucide-react'
import { runDirectorAudit } from '../../utils/directorAudit'

const SERVER_URL = 'http://localhost:3001'

const SEVERITY_META = {
  critical: { color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'critical', Icon: AlertCircle },
  warning:  { color: '#fbbf24', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'warning',  Icon: AlertTriangle },
  info:     { color: '#93c5fd', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', label: 'note',     Icon: Info },
}

const CATEGORY_LABELS = {
  coverage: 'Coverage', repetition: 'Repetition', continuity: 'Continuity',
  evidence: 'Evidence', production: 'Production',
}

function countBySeverity(warnings) {
  return warnings.reduce((acc, w) => { acc[w.severity] = (acc[w.severity] || 0) + 1; return acc }, {})
}

function highestSeverity(counts) {
  if (counts.critical) return 'critical'
  if (counts.warning) return 'warning'
  if (counts.info) return 'info'
  return null
}

function StatRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11.5 }}>
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      <span style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function DistributionRow({ label, entries, formatKey }) {
  if (!entries || !entries.length) return null
  return (
    <div style={{ fontSize: 11.5 }}>
      <div style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {entries.map(e => (
          <span key={e.key} style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10.5,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
          }}>
            {formatKey ? formatKey(e.key) : e.key} · {e.count} ({e.percent.toFixed(0)}%)
          </span>
        ))}
      </div>
    </div>
  )
}

function WarningRow({ warning, onSceneClick }) {
  const [open, setOpen] = useState(false)
  const meta = SEVERITY_META[warning.severity]
  const Icon = meta.Icon
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 4px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 12.5 }}>{warning.title}</span>
        {warning.sceneIds.length > 0 && (
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, flexShrink: 0 }}>
            {warning.sceneIds.length} scene{warning.sceneIds.length !== 1 ? 's' : ''}
          </span>
        )}
        {open ? <ChevronUp size={12} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />}
      </button>
      {open && (
        <div style={{ padding: '0 4px 12px 27px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-line', margin: '0 0 8px' }}>
            {warning.detail}
          </p>
          {warning.sceneIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {warning.sceneIds.map(id => (
                <button
                  key={id}
                  onClick={() => onSceneClick(id, warning.category === 'continuity' || warning.category === 'evidence' ? 'direction' : 'visual')}
                  style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontFamily: 'monospace',
                    background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color, cursor: 'pointer',
                  }}
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DirectorReviewPanel({
  scenes, direction, projectId, onDirectionChange,
  sourceScript, targetDurationMinutes, imagePaths, selectedClips,
  onScrollToScene,
}) {
  const storedAudit = direction?.audit || null
  const [report, setReport] = useState(storedAudit)
  const [expanded, setExpanded] = useState(false)

  // `direction` can arrive after this component's first render — e.g. VideoCreator's
  // mount-time fetch of direction.json resolves asynchronously, or the project itself
  // changes. `report`'s initial useState value only captures whatever `direction.audit`
  // was at mount, so without this it can get stuck showing "not yet run" (or a stale
  // report from a previous project) even after the real stored audit arrives.
  useEffect(() => {
    const t = setTimeout(() => setReport(direction?.audit || null), 0)
    return () => clearTimeout(t)
  }, [direction?.audit])
  const [running, setRunning] = useState(false)
  const [criticalOnly, setCriticalOnly] = useState(false)
  const [hideInfo, setHideInfo] = useState(false)

  const changedSinceReview = report != null && report.sceneCountAtReview !== scenes.length

  const runReview = async () => {
    setRunning(true)
    try {
      const result = runDirectorAudit(scenes, direction, { sourceScript, targetDurationMinutes, imagePaths, selectedClips })
      const withCount = { ...result, sceneCountAtReview: scenes.length }
      setReport(withCount)
      setExpanded(true)
      if (projectId) {
        await fetch(`${SERVER_URL}/api/director/${projectId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ audit: withCount }),
        }).catch(() => {}) // local report already applied — persistence failure is non-fatal
        // A project that skipped Direction entirely has no pre-existing direction object —
        // build a minimal one rather than dropping the audit update (matches the server's
        // PATCH route, which now creates a fresh direction.json for an audit-only save too).
        onDirectionChange?.(prev => ({ ...(prev || { version: 1, treatment: {} }), audit: withCount }))
      }
    } finally {
      setRunning(false)
    }
  }

  const counts = useMemo(() => report ? countBySeverity(report.warnings) : {}, [report])
  const topSeverity = highestSeverity(counts)

  const visibleWarnings = useMemo(() => {
    if (!report) return []
    return report.warnings.filter(w => {
      if (criticalOnly && w.severity !== 'critical') return false
      if (hideInfo && w.severity === 'info') return false
      return true
    })
  }, [report, criticalOnly, hideInfo])

  const grouped = useMemo(() => {
    const map = {}
    visibleWarnings.forEach(w => { (map[w.category] = map[w.category] || []).push(w) })
    return map
  }, [visibleWarnings])

  const barMeta = topSeverity ? SEVERITY_META[topSeverity] : null

  return (
    <div className="vorta-panel" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        background: report ? (barMeta ? barMeta.bg : 'rgba(34,197,94,0.08)') : 'rgba(255,255,255,0.02)',
        borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        <button
          onClick={() => report && setExpanded(v => !v)}
          disabled={!report}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
            cursor: report ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit', padding: 0,
          }}
        >
          {!report && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Director Review — not yet run</span>}
          {report && !topSeverity && <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>✓ Director Review — no issues found</span>}
          {report && topSeverity && (
            <span style={{ color: barMeta.color, fontSize: 13, fontWeight: 600 }}>
              Director Review — {counts.critical ? `${counts.critical} critical` : ''}
              {counts.critical && counts.warning ? ', ' : ''}
              {counts.warning ? `${counts.warning} warning${counts.warning !== 1 ? 's' : ''}` : ''}
              {(counts.critical || counts.warning) && counts.info ? ', ' : ''}
              {counts.info ? `${counts.info} note${counts.info !== 1 ? 's' : ''}` : ''}
            </span>
          )}
          {report && (
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10.5 }}>
              {new Date(report.generatedAt).toLocaleString()}
            </span>
          )}
          {changedSinceReview && (
            <span style={{ color: 'rgba(251,191,36,0.8)', fontSize: 10.5, fontStyle: 'italic' }}>
              · Scene plan changed since last review
            </span>
          )}
          {report && (expanded ? <ChevronUp size={13} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />)}
        </button>
        <button
          onClick={runReview}
          disabled={running || !scenes.length}
          className="vorta-btn vorta-btn-secondary vorta-btn-sm"
          style={{ flexShrink: 0 }}
        >
          <RefreshCw size={11} style={running ? { animation: 'spin 1s linear infinite' } : undefined} />
          {running ? 'Reviewing…' : report ? 'Re-run Review' : 'Run Review'}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && report && (
        <div style={{ padding: '16px' }}>
          {/* Stats grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14,
            padding: '12px 14px', marginBottom: 16,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <StatRow label="Total scenes" value={report.stats.totalScenes} />
              <StatRow label="Total duration" value={`${report.stats.totalDurationSeconds.toFixed(0)}s`} />
              <StatRow label="Avg scene" value={`${report.stats.averageSceneDuration.toFixed(1)}s`} />
              {report.stats.durationDeltaPercent != null && (
                <StatRow label="vs target" value={`${report.stats.durationDeltaPercent > 0 ? '+' : ''}${report.stats.durationDeltaPercent}%`} />
              )}
              <StatRow label="Shortest" value={report.stats.shortestScene ? `${report.stats.shortestScene.scene_id} (${report.stats.shortestScene.duration}s)` : null} />
              <StatRow label="Longest" value={report.stats.longestScene ? `${report.stats.longestScene.scene_id} (${report.stats.longestScene.duration}s)` : null} />
              <StatRow label="Locked scenes" value={report.stats.lockedCount} />
              <StatRow label="Images generated" value={report.stats.imagesGenerated} />
              {report.stats.aiVsAuthentic.aiPercent != null && (
                <StatRow label="AI vs authentic" value={`${report.stats.aiVsAuthentic.aiCount} AI / ${report.stats.aiVsAuthentic.authenticCount} authentic (${report.stats.aiVsAuthentic.aiPercent.toFixed(0)}% AI)`} />
              )}
            </div>
            <DistributionRow label="Shot type" entries={report.stats.shotTypeDistribution} />
            <DistributionRow label="Scene type" entries={report.stats.sceneTypeDistribution} />
            <DistributionRow label="Complexity" entries={report.stats.complexityDistribution} />
            <DistributionRow label="Retention" entries={report.stats.retentionDistribution} />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              <input type="checkbox" checked={criticalOnly} onChange={e => setCriticalOnly(e.target.checked)} />
              Critical only
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              <input type="checkbox" checked={hideInfo} onChange={e => setHideInfo(e.target.checked)} />
              Hide info
            </label>
          </div>

          {/* Warnings grouped by category */}
          {Object.keys(grouped).length === 0 && (
            <p className="vorta-hint">No warnings match the current filters.</p>
          )}
          {Object.entries(grouped).map(([category, warnings]) => (
            <div key={category} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
                {CATEGORY_LABELS[category] || category}
              </div>
              {warnings.map(w => (
                <WarningRow key={w.id} warning={w} onSceneClick={onScrollToScene} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
