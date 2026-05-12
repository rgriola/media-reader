/**
 * RipPanel — Batch rip MXF clips to MP4 with clip selection and progress
 * Follows the same UI pattern as MergePanel.tsx
 * Updated: May 12, 2026 - 6:08pm
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { formatFramesDuration } from '../utils/formatters'
import type { VideoFileInfo } from '../types'

interface RipPanelProps {
  /** Video files available for ripping */
  files: VideoFileInfo[]
  /** Called when the panel should close */
  onClose: () => void
}

type RipStatus = 'ready' | 'ripping' | 'done' | 'error'
type RipQuality = 'original' | '1080p' | '720p'

const QUALITY_LABELS: Record<RipQuality, string> = {
  original: 'Original (Remux)',
  '1080p': '1080p',
  '720p': '720p'
}

const QUALITY_DESCRIPTIONS: Record<RipQuality, string> = {
  original: 'Stream copy — lossless, near-instant. Keeps original 4K resolution.',
  '1080p': 'Re-encode to 1080p H.264 — great for sharing, smaller file size.',
  '720p': 'Re-encode to 720p H.264 — compact, fast uploads and playback anywhere.'
}

export function RipPanel({ files, onClose }: RipPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<RipStatus>('ready')
  const [selectedClips, setSelectedClips] = useState<Set<string>>(
    new Set(files.filter((f) => f.size !== 0).map((f) => f.path))
  )
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [quality, setQuality] = useState<RipQuality>('original')
  const [progress, setProgress] = useState(0)
  const [currentClip, setCurrentClip] = useState(0)
  const [totalClips, setTotalClips] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resultCount, setResultCount] = useState(0)
  const progressCleanupRef = useRef<(() => void) | null>(null)

  // Default output filename
  const defaultName = `rip_${new Date().toISOString().slice(0, 10)}`

  // Cleanup progress listener on unmount
  useEffect(() => {
    return (): void => {
      if (progressCleanupRef.current) {
        progressCleanupRef.current()
      }
    }
  }, [])

  // ─── Toggle selection ─────────────────────────────────────

  const toggleClip = useCallback((clipPath: string) => {
    setSelectedClips((prev) => {
      const next = new Set(prev)
      if (next.has(clipPath)) {
        next.delete(clipPath)
      } else {
        next.add(clipPath)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    const eligible = files.filter((f) => f.size !== 0)
    if (selectedClips.size === eligible.length) {
      setSelectedClips(new Set())
    } else {
      setSelectedClips(new Set(eligible.map((f) => f.path)))
    }
  }, [files, selectedClips])

  // ─── Pick output directory ────────────────────────────────

  const pickOutput = useCallback(async () => {
    const result = await window.api.selectRipOutput()
    if (result) {
      setOutputDir(result)
    }
  }, [])

  // ─── Start rip ────────────────────────────────────────────

  const startRip = useCallback(async () => {
    if (!outputDir || selectedClips.size === 0) return

    setStatus('ripping')
    setProgress(0)
    setCurrentClip(0)
    setTotalClips(selectedClips.size)
    setErrorMsg(null)

    // Listen for progress updates
    const cleanup = window.api.onRipProgress((percent: number, clip: number, total: number) => {
      setProgress(percent)
      setCurrentClip(clip)
      setTotalClips(total)
    })
    progressCleanupRef.current = cleanup

    try {
      const activePaths = files.filter((f) => selectedClips.has(f.path)).map((f) => f.path)

      const result = await window.api.ripClips(activePaths, outputDir, quality)

      cleanup()
      progressCleanupRef.current = null

      if (result.success) {
        setResultCount(result.outputPaths?.length ?? activePaths.length)
        setProgress(100)
        setStatus('done')
      } else {
        setErrorMsg(result.error || 'Rip failed')
        setStatus('error')
      }
    } catch (err) {
      cleanup()
      progressCleanupRef.current = null
      setErrorMsg(err instanceof Error ? err.message : 'Rip failed')
      setStatus('error')
    }
  }, [outputDir, selectedClips, files, quality])

  // ─── Cancel rip ───────────────────────────────────────────

  const cancelRip = useCallback(async () => {
    await window.api.cancelRip()
    if (progressCleanupRef.current) {
      progressCleanupRef.current()
      progressCleanupRef.current = null
    }
    setStatus('ready')
    setProgress(0)
  }, [])

  // ─── Computed values ──────────────────────────────────────

  const selectedCount = selectedClips.size
  const eligibleFiles = files.filter((f) => f.size !== 0)

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-black/70 backdrop-blur-sm">
      <div className="glass w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-surface-border">
        {/* Header */}
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple flex items-center justify-center text-xl">
              💾
            </div>
            <div>
              <h2 className="panel-title">Rip to MP4</h2>
              <p className="text-body text-muted">
                {eligibleFiles.length} clip{eligibleFiles.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'ripping'}
            className="btn-icon w-8 h-8 flex items-center justify-center text-muted hover:text-app-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg text-body flex items-center gap-2 bg-accent/20 text-accent border border-accent/30">
          <span className="text-body">ℹ️</span>
          <span>{QUALITY_DESCRIPTIONS[quality]}</span>
        </div>

        {/* Quality selector */}
        {status !== 'ripping' && status !== 'done' && (
          <div className="mx-6 mt-3 flex items-center gap-3">
            <label className="text-body text-muted flex-shrink-0">Quality:</label>
            <div className="flex rounded-lg overflow-hidden border border-surface-border text-body">
              {(Object.keys(QUALITY_LABELS) as RipQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q)}
                  className={`px-4 py-1.5 font-bold transition-colors border-l border-surface-border first:border-l-0 ${
                    quality === q
                      ? 'bg-accent text-app-white'
                      : 'bg-surface-raised text-muted hover:bg-surface-border hover:text-app-white'
                  }`}
                >
                  {QUALITY_LABELS[q]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clip List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          <div className="space-y-1">
            {/* Select all header */}
            <div className="flex items-center gap-3 px-3 py-2 section-label">
              <button
                onClick={toggleAll}
                className="w-5 h-5 rounded border border-surface-border flex items-center justify-center hover:border-accent transition-colors"
              >
                {selectedClips.size === eligibleFiles.length ? (
                  <span className="text-accent text-special">✓</span>
                ) : null}
              </button>
              <span className="flex-1">Filename</span>
              <span className="w-24 text-right">Duration</span>
              <span className="w-20 text-right">Audio</span>
              <span className="w-16 text-right">Type</span>
            </div>

            {/* Clip rows */}
            {files.map((file) => {
              const isEmpty = file.size === 0
              const ext = file.name.split('.').pop()?.toUpperCase() ?? ''
              return (
                <button
                  key={file.path}
                  onClick={() => toggleClip(file.path)}
                  disabled={status === 'ripping' || status === 'done' || isEmpty}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    isEmpty
                      ? 'opacity-30 cursor-not-allowed'
                      : selectedClips.has(file.path)
                        ? 'bg-surface-raised hover:bg-surface-border/60'
                        : 'hover:bg-surface/60 opacity-50'
                  } disabled:cursor-default`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      selectedClips.has(file.path)
                        ? 'bg-accent border-accent text-app-white'
                        : 'border-surface-border'
                    }`}
                  >
                    {selectedClips.has(file.path) && <span className="text-special">✓</span>}
                  </div>
                  <span className="flex-1 card-value-mono truncate">{file.name}</span>
                  <span className="w-24 text-right card-value-mono">
                    {file.durationFrames && file.fps
                      ? formatFramesDuration(file.durationFrames, file.fps)
                      : (file.metadata?.duration ?? '—')}
                  </span>
                  <span className="w-20 text-right text-data text-muted">
                    {file.audioChannels ? `${file.audioChannels}ch` : '—'}
                  </span>
                  <span className="w-16 text-right">
                    <span className={ext === 'MXF' ? 'badge-mxf' : 'badge-mp4'}>{ext}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Summary + Output */}
        <div className="border-t border-surface-border px-6 py-4 space-y-3">
          {/* Summary bar */}
          <div className="flex items-center justify-between text-body">
            <span className="text-muted">
              {selectedCount} of {eligibleFiles.length} clips selected
            </span>
            <span className="card-value-mono">{defaultName}/</span>
          </div>

          {/* Output path */}
          {status !== 'done' && (
            <div className="flex items-center gap-3">
              <button
                onClick={pickOutput}
                disabled={status === 'ripping'}
                className="btn-secondary flex-shrink-0 disabled:opacity-50"
              >
                {outputDir ? 'Change…' : 'Choose Output Folder'}
              </button>
              {outputDir && (
                <span className="text-body text-muted truncate" title={outputDir}>
                  📂 {outputDir}
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          {status === 'ripping' && (
            <div className="space-y-2">
              <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-purple transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-body">
                <span className="text-muted">
                  Ripping clip {currentClip} of {totalClips}…
                </span>
                <span className="text-accent font-mono font-bold">{progress}%</span>
              </div>
            </div>
          )}

          {/* Done message */}
          {status === 'done' && (
            <div className="bg-success/20 border border-success/30 rounded-lg px-4 py-3 text-body">
              <div className="alert-title text-success">✅ Rip complete!</div>
              <div className="text-success/70 mt-1">
                {resultCount} clip{resultCount !== 1 ? 's' : ''} saved to: {outputDir}
              </div>
            </div>
          )}

          {/* Error message */}
          {!!errorMsg && (
            <div className="bg-danger/20 border border-danger/30 rounded-lg px-4 py-3 text-body text-danger">
              ❌ {errorMsg}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
          {status === 'ripping' ? (
            <button onClick={cancelRip} className="btn-danger px-5 py-2.5">
              Cancel Rip
            </button>
          ) : status === 'done' ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-success hover:bg-success/80 text-app-white rounded-lg text-body font-bold transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary px-5 py-2.5">
                Cancel
              </button>
              <button
                onClick={startRip}
                disabled={selectedCount === 0 || !outputDir}
                className="px-5 py-2.5 bg-gradient-to-r from-accent to-purple hover:from-accent-hover hover:to-purple/80 rounded-lg text-body font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              >
                💾 Rip {selectedCount} Clip{selectedCount !== 1 ? 's' : ''} to MP4
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
