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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl">
              🎬
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Batch Merge</h2>
              <p className="text-sm text-gray-400">
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
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Compatibility Badge */}
        {status !== 'validating' && validation && (
          <div className={`mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${
            validation.compatible
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50'
              : 'bg-amber-900/40 text-amber-300 border border-amber-800/50'
          }`}>
            <span className="text-base">{validation.compatible ? '✅' : '⚠️'}</span>
            {validation.compatible
              ? 'Lossless merge ready — all clips share identical parameters'
              : `Re-encode required — ${validation.mismatches.length} parameter mismatch${validation.mismatches.length > 1 ? 'es' : ''}`}
          </div>
        )}

        {/* Mismatches detail */}
        {validation && !validation.compatible && validation.mismatches.length > 0 && (
          <div className="mx-6 mt-2 px-4 py-2 bg-gray-900/60 rounded-lg text-xs text-gray-400 max-h-20 overflow-y-auto">
            {validation.mismatches.map((m, i) => (
              <div key={i} className="py-0.5">• {m}</div>
            ))}
          </div>
        )}

        {/* Clip List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {status === 'validating' ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-blue-400 border-t-transparent rounded-full" />
              <span className="ml-3 text-gray-400">Analyzing clips with FFprobe…</span>
            </div>
          ) : validation ? (
            <div className="space-y-1">
              {/* Select all header */}
              <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 uppercase tracking-wider font-medium">
                <button
                  onClick={toggleAll}
                  className="w-5 h-5 rounded border border-gray-600 flex items-center justify-center hover:border-blue-400 transition-colors"
                >
                  {selectedClips.size === validation.clips.length ? (
                    <span className="text-blue-400 text-xs">✓</span>
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
                      ? 'bg-gray-800/60 hover:bg-gray-800'
                      : 'hover:bg-gray-800/30 opacity-50'
                  } disabled:cursor-default`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                      selectedClips.has(clip.path)
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-600'
                    }`}
                  >
                    {selectedClips.has(clip.path) && <span className="text-xs">✓</span>}
                  </div>
                  <span className="flex-1 text-sm text-gray-200 truncate font-mono">
                    {clip.filename}
                  </span>
                  <span className="w-20 text-right text-sm text-gray-400 font-mono">
                    {formatDuration(clip.duration)}
                  </span>
                  <span className="w-24 text-right text-sm text-gray-400">
                    {clip.codec.toUpperCase()}
                  </span>
                  <span className="w-28 text-right text-sm text-gray-400">
                    {clip.resolution.width}×{clip.resolution.height}
                  </span>
                  <span className="w-20 text-right text-sm text-gray-500">
                    {formatBytes(clip.fileSize)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Summary + Output */}
        {validation && status !== 'validating' && (
          <div className="border-t border-gray-800 px-6 py-4 space-y-3">
            {/* Summary bar */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                {selectedCount} of {validation.clips.length} clips selected
              </span>
              <span className="text-gray-300 font-mono">
                {formatDuration(selectedDuration)} &nbsp;·&nbsp; {formatBytes(selectedSize)}
              </span>
            </div>

            {/* Audio channel mode toggle — always visible */}
            {status !== 'merging' && status !== 'done' && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400 flex-shrink-0">Audio Channels:</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
                  <button
                    id="audio-ch1-4-btn"
                    onClick={() => setAudioChannelMode('ch1-4')}
                    className={`px-4 py-1.5 font-medium transition-colors ${
                      audioChannelMode === 'ch1-4'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    Ch 1–4
                  </button>
                  <button
                    id="audio-ch1-8-btn"
                    onClick={() => setAudioChannelMode('ch1-8')}
                    className={`px-4 py-1.5 font-medium transition-colors border-l border-gray-700 ${
                      audioChannelMode === 'ch1-8'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    Ch 1–8
                  </button>
                </div>
                <span className="text-xs text-gray-500">
                  {audioChannelMode === 'ch1-4'
                    ? 'Streams 0–3 (camera audio)'
                    : 'Streams 0–7 (incl. empty tracks)'}
                </span>
              </div>
            )}

            {/* Preset picker (only when re-encode needed) */}
            {!validation.compatible && status !== 'merging' && status !== 'done' && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400 flex-shrink-0">Encoding Preset:</label>
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as MergePreset)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
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
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-200 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {outputPath ? 'Change…' : 'Choose Output Location'}
                </button>
                {outputPath && (
                  <span className="text-sm text-gray-400 truncate" title={outputPath}>
                    {outputPath}
                  </span>
                )}
              </div>
            )}

            {/* Progress bar */}
            {status === 'merging' && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {validation.compatible ? 'Merging (lossless)…' : 'Encoding…'}
                  </span>
                  <span className="text-blue-400 font-mono font-semibold">
                    {progress}%
                  </span>
                </div>
              </div>
            )}

            {/* Done message */}
            {status === 'done' && mergeResult && (
              <div className="bg-emerald-900/40 border border-emerald-800/50 rounded-lg px-4 py-3 text-sm">
                <div className="text-emerald-300 font-medium">✅ Merge complete!</div>
                <div className="text-emerald-400/70 mt-1">
                  Output: {mergeResult.outputPath}
                  {mergeResult.fileSize ? ` · ${formatBytes(mergeResult.fileSize)}` : ''}
                </div>
              </div>
            )}

            {/* Error message */}
            {errorMsg && (
              <div className="bg-red-900/40 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-300">
                ❌ {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          {status === 'merging' ? (
            <button
              onClick={cancelMerge}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel Merge
            </button>
          ) : status === 'done' ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startMerge}
                disabled={selectedCount < 2 || !outputPath || status === 'validating'}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/20"
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
