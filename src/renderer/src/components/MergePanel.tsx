import { useState, useEffect, useCallback, useRef } from 'react'
import type { MergeValidation, MergePreset, MergeResult, AudioChannelMode } from '../types'

interface MergePanelProps {
  /** Array of MXF file paths to merge */
  clipPaths: string[]
  /** Called when the panel should close */
  onClose: () => void
}

type MergeStatus = 'idle' | 'validating' | 'ready' | 'merging' | 'done' | 'error'

/**
 * Format bytes into human-readable string (e.g., "1.2 GB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Format duration in seconds to HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PRESET_LABELS: Record<MergePreset, string> = {
  'match-source': 'Match Source (H.264 High Quality)',
  'prores-422': 'Apple ProRes 422',
  'h264-high': 'H.264 High Quality',
  dnxhd: 'Avid DNxHR HQ'
}

export function MergePanel({ clipPaths, onClose }: MergePanelProps): React.JSX.Element {
  const [status, setStatus] = useState<MergeStatus>('idle')
  const [validation, setValidation] = useState<MergeValidation | null>(null)
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set())
  const [outputPath, setOutputPath] = useState<string | null>(null)
  const [preset, setPreset] = useState<MergePreset>('h264-high')
  const [audioChannelMode, setAudioChannelMode] = useState<AudioChannelMode>('ch1-4')
  const [progress, setProgress] = useState(0)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const progressCleanupRef = useRef<(() => void) | null>(null)

  // -----------------------------------------------------------------------
  // Validate clips on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (clipPaths.length === 0) return

    const run = async (): Promise<void> => {
      setStatus('validating')
      setErrorMsg(null)
      try {
        const result: MergeValidation = await window.api.validateMerge(clipPaths)
        setValidation(result)
        setSelectedClips(new Set(result.clips.map((c) => c.path)))
        setStatus('ready')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Validation failed')
        setStatus('error')
      }
    }

    run()
  }, [clipPaths])

  // -----------------------------------------------------------------------
  // Cleanup progress listener on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (progressCleanupRef.current) {
        progressCleanupRef.current()
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // Toggle a single clip's selection
  // -----------------------------------------------------------------------
  const toggleClip = useCallback(
    (clipPath: string) => {
      setSelectedClips((prev) => {
        const next = new Set(prev)
        if (next.has(clipPath)) {
          next.delete(clipPath)
        } else {
          next.add(clipPath)
        }
        return next
      })
    },
    []
  )

  // -----------------------------------------------------------------------
  // Select / deselect all
  // -----------------------------------------------------------------------
  const toggleAll = useCallback(() => {
    if (!validation) return
    if (selectedClips.size === validation.clips.length) {
      setSelectedClips(new Set())
    } else {
      setSelectedClips(new Set(validation.clips.map((c) => c.path)))
    }
  }, [validation, selectedClips])

  // -----------------------------------------------------------------------
  // Pick output path
  // -----------------------------------------------------------------------
  const pickOutput = useCallback(async () => {
    const result = await window.api.selectMergeOutput()
    if (result) {
      setOutputPath(result)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Start merge
  // -----------------------------------------------------------------------
  const startMerge = useCallback(async () => {
    if (!outputPath || selectedClips.size < 2 || !validation) return

    setStatus('merging')
    setProgress(0)
    setErrorMsg(null)

    // Listen for progress updates
    const cleanup = window.api.onMergeProgress((percent) => {
      setProgress(percent)
    })
    progressCleanupRef.current = cleanup

    try {
      // Filter to selected clips only, preserving original order
      const activePaths = clipPaths.filter((p) => selectedClips.has(p))

      const result: MergeResult = await window.api.mergeClips({
        clipPaths: activePaths,
        outputPath,
        mode: validation.compatible ? 'lossless' : 'reencode',
        preset: validation.compatible ? undefined : preset,
        audioChannelMode
      })

      cleanup()
      progressCleanupRef.current = null

      if (result.success) {
        setMergeResult(result)
        setProgress(100)
        setStatus('done')
      } else {
        setErrorMsg(result.error || 'Merge failed')
        setStatus('error')
      }
    } catch (err) {
      cleanup()
      progressCleanupRef.current = null
      setErrorMsg(err instanceof Error ? err.message : 'Merge failed')
      setStatus('error')
    }
  }, [outputPath, selectedClips, validation, clipPaths, preset])

  // -----------------------------------------------------------------------
  // Cancel merge
  // -----------------------------------------------------------------------
  const cancelMerge = useCallback(async () => {
    await window.api.cancelMerge()
    if (progressCleanupRef.current) {
      progressCleanupRef.current()
      progressCleanupRef.current = null
    }
    setStatus('ready')
    setProgress(0)
  }, [])

  // -----------------------------------------------------------------------
  // Computed values
  // -----------------------------------------------------------------------
  const selectedCount = selectedClips.size
  const selectedDuration = validation
    ? validation.clips.filter((c) => selectedClips.has(c.path)).reduce((sum, c) => sum + c.duration, 0)
    : 0
  const selectedSize = validation
    ? validation.clips.filter((c) => selectedClips.has(c.path)).reduce((sum, c) => sum + c.fileSize, 0)
    : 0

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-black/70 backdrop-blur-sm">
      <div className="glass w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-surface-border">
        {/* Header */}
        <div className="panel-header">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success to-[#0D9488] flex items-center justify-center text-xl">
              🎬
            </div>
            <div>
              <h2 className="text-subheader text-app-white">Batch Merge</h2>
              <p className="text-body text-muted">
                {status === 'validating'
                  ? 'Analyzing clips…'
                  : validation
                    ? `${validation.clips.length} clips detected`
                    : 'Loading…'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={status === 'merging'}
            className="btn-icon w-8 h-8 flex items-center justify-center text-muted hover:text-app-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Compatibility Badge */}
        {status !== 'validating' && validation && (
          <div className={`mx-6 mt-4 px-4 py-2.5 rounded-lg text-body font-bold flex items-center gap-2 ${
            validation.compatible
              ? 'bg-success/20 text-success border border-success/30'
              : 'bg-warning/20 text-warning border border-warning/30'
          }`}>
            <span className="text-base">{validation.compatible ? '✅' : '⚠️'}</span>
            {validation.compatible
              ? 'Lossless merge ready — all clips share identical parameters'
              : `Re-encode required — ${validation.mismatches.length} parameter mismatch${validation.mismatches.length > 1 ? 'es' : ''}`}
          </div>
        )}

        {/* Mismatches detail */}
        {validation && !validation.compatible && validation.mismatches.length > 0 && (
          <div className="mx-6 mt-2 px-4 py-2 bg-surface/60 rounded-lg text-special text-muted max-h-20 overflow-y-auto">
            {validation.mismatches.map((m, i) => (
              <div key={i} className="py-0.5">• {m}</div>
            ))}
          </div>
        )}

        {/* Clip List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {status === 'validating' ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
              <span className="ml-3 text-muted">Analyzing clips with FFprobe…</span>
            </div>
          ) : validation ? (
            <div className="space-y-1">
              {/* Select all header */}
              <div className="flex items-center gap-3 px-3 py-2 section-label">
                <button
                  onClick={toggleAll}
                  className="w-5 h-5 rounded border border-surface-border flex items-center justify-center hover:border-accent transition-colors"
                >
                  {selectedClips.size === validation.clips.length ? (
                    <span className="text-accent text-special">✓</span>
                  ) : null}
                </button>
                <span className="flex-1">Filename</span>
                <span className="w-20 text-right">Duration</span>
                <span className="w-24 text-right">Codec</span>
                <span className="w-28 text-right">Resolution</span>
                <span className="w-20 text-right">Size</span>
              </div>

              {/* Clip rows */}
              {validation.clips.map((clip) => (
                <button
                  key={clip.path}
                  onClick={() => toggleClip(clip.path)}
                  disabled={status === 'merging' || status === 'done'}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    selectedClips.has(clip.path)
                      ? 'bg-surface-raised hover:bg-surface-border/60'
                      : 'hover:bg-surface/60 opacity-50'
                  } disabled:cursor-default`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      selectedClips.has(clip.path)
                        ? 'bg-accent border-accent text-app-white'
                        : 'border-surface-border'
                    }`}
                  >
                    {selectedClips.has(clip.path) && <span className="text-special">✓</span>}
                  </div>
                  <span className="flex-1 card-value-mono truncate">
                    {clip.filename}
                  </span>
                  <span className="w-20 text-right card-value-mono">
                    {formatDuration(clip.duration)}
                  </span>
                  <span className="w-24 text-right card-value">
                    {clip.codec.toUpperCase()}
                  </span>
                  <span className="w-28 text-right card-value">
                    {clip.resolution.width}×{clip.resolution.height}
                  </span>
                  <span className="w-20 text-right text-data text-muted">
                    {formatBytes(clip.fileSize)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Summary + Output */}
        {validation && status !== 'validating' && (
          <div className="border-t border-surface-border px-6 py-4 space-y-3">
            {/* Summary bar */}
            <div className="flex items-center justify-between text-body">
              <span className="text-muted">
                {selectedCount} of {validation.clips.length} clips selected
              </span>
              <span className="card-value-mono">
                {formatDuration(selectedDuration)} &nbsp;·&nbsp; {formatBytes(selectedSize)}
              </span>
            </div>

            {/* Audio channel mode toggle — always visible */}
            {status !== 'merging' && status !== 'done' && (
              <div className="flex items-center gap-3">
                <label className="text-body text-muted flex-shrink-0">Audio Channels:</label>
                <div className="flex rounded-lg overflow-hidden border border-surface-border text-body">
                  <button
                    id="audio-ch1-4-btn"
                    onClick={() => setAudioChannelMode('ch1-4')}
                    className={`px-4 py-1.5 font-bold transition-colors ${
                      audioChannelMode === 'ch1-4'
                        ? 'bg-accent text-app-white'
                        : 'bg-surface-raised text-muted hover:bg-surface-border hover:text-app-white'
                    }`}
                  >
                    Ch 1–4
                  </button>
                  <button
                    id="audio-ch1-8-btn"
                    onClick={() => setAudioChannelMode('ch1-8')}
                    className={`px-4 py-1.5 font-bold transition-colors border-l border-surface-border ${
                      audioChannelMode === 'ch1-8'
                        ? 'bg-accent text-app-white'
                        : 'bg-surface-raised text-muted hover:bg-surface-border hover:text-app-white'
                    }`}
                  >
                    Ch 1–8
                  </button>
                </div>
                <span className="text-special text-muted">
                  {audioChannelMode === 'ch1-4'
                    ? 'Streams 0–3 (camera audio)'
                    : 'Streams 0–7 (incl. empty tracks)'}
                </span>
              </div>
            )}

            {/* Preset picker (only when re-encode needed) */}
            {!validation.compatible && status !== 'merging' && status !== 'done' && (
              <div className="flex items-center gap-3">
                <label className="text-body text-muted flex-shrink-0">Encoding Preset:</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as MergePreset)}
                  className="flex-1 bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-body text-app-white focus:outline-none focus:border-accent"
                >
                  {(Object.keys(PRESET_LABELS) as MergePreset[]).map((key) => (
                    <option key={key} value={key}>
                      {PRESET_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Output path */}
            {status !== 'done' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={pickOutput}
                  disabled={status === 'merging'}
                  className="btn-secondary flex-shrink-0 disabled:opacity-50"
                >
                  {outputPath ? 'Change…' : 'Choose Output Location'}
                </button>
                {outputPath && (
                  <span className="text-body text-muted truncate" title={outputPath}>
                    {outputPath}
                  </span>
                )}
              </div>
            )}

            {/* Progress bar */}
            {status === 'merging' && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-success transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-body">
                  <span className="text-muted">
                    {validation.compatible ? 'Merging (lossless)…' : 'Encoding…'}
                  </span>
                  <span className="text-accent font-mono font-bold">
                    {progress}%
                  </span>
                </div>
              </div>
            )}

            {/* Done message */}
            {status === 'done' && mergeResult && (
              <div className="bg-success/20 border border-success/30 rounded-lg px-4 py-3 text-body">
                <div className="text-success font-bold">✅ Merge complete!</div>
                <div className="text-success/70 mt-1">
                  Output: {mergeResult.outputPath}
                  {mergeResult.fileSize ? ` · ${formatBytes(mergeResult.fileSize)}` : ''}
                </div>
              </div>
            )}

            {/* Error message */}
            {errorMsg && (
              <div className="bg-danger/20 border border-danger/30 rounded-lg px-4 py-3 text-body text-danger">
                ❌ {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
          {status === 'merging' ? (
            <button onClick={cancelMerge} className="btn-danger px-5 py-2.5">
              Cancel Merge
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
                onClick={startMerge}
                disabled={selectedCount < 2 || !outputPath || status === 'validating'}
                className="px-5 py-2.5 bg-gradient-to-r from-accent to-success hover:from-accent-hover hover:to-success/80 rounded-lg text-body font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
              >
                {validation?.compatible ? '⚡ Merge Clips (Lossless)' : '🔄 Merge Clips (Re-encode)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
