import { useState, useMemo } from 'react'
import { useMediaStore } from './store/mediaStore'
import { DriveBrowser } from './components/DriveBrowser'
import { VideoPlayer } from './components/VideoPlayer'
import { MergePanel } from './components/MergePanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { XMLMetadata } from './types'

type PlaybackState =
  | { status: 'idle' }
  | { status: 'ready'; videoPath: string; isMxfStream: boolean }

function App(): React.JSX.Element {
  const [playback, setPlayback] = useState<PlaybackState>({ status: 'idle' })
  const [mergeClipPaths, setMergeClipPaths] = useState<string[] | null>(null)
  const [xmlMetadata, setXmlMetadata] = useState<XMLMetadata | undefined>(undefined)
  const { currentFile, metadata, error, loadFile } = useMediaStore()

  const dismissError = (): void => {
    useMediaStore.getState().setError(null)
  }

  // Clean up player state on close
  const closePlayer = (): void => {
    setPlayback({ status: 'idle' })
  }

  const handleFileSelect = async (
    filepath: string,
    xml?: XMLMetadata,
    forceOriginal?: boolean
  ): Promise<void> => {
    const success = await loadFile(filepath)
    if (!success) return

    // Stash the XML sidecar metadata (has correctly decoded startTimecode)
    setXmlMetadata(xml)

    const { proxy: freshProxy, currentFile: freshFile } = useMediaStore.getState()

    if (!forceOriginal && freshProxy?.exists === true && freshProxy?.path) {
      // Proxy MP4 — play directly via local:// protocol (no encoding needed)
      console.log('Using proxy file:', freshProxy.path)
      setPlayback({ status: 'ready', videoPath: freshProxy.path, isMxfStream: false })
    } else if (freshFile) {
      // No proxy (or forced original) — stream MXF live via mxfstream://
      console.log(
        forceOriginal ? 'Forced MXF playback:' : 'No proxy — streaming MXF directly:',
        freshFile
      )
      const encodedPath = freshFile
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
      const streamUrl = `mxfstream://${encodedPath}`
      setPlayback({ status: 'ready', videoPath: streamUrl, isMxfStream: true })
    }
  }

  const videoPath = useMemo(() => {
    if (playback.status === 'ready') return playback.videoPath
    return null
  }, [playback])

  const isTranscoded = playback.status === 'ready' && playback.isMxfStream
  const isMxfStream = playback.status === 'ready' && playback.isMxfStream

  return (
    <div className="flex flex-col h-screen bg-app-black text-app-white">
      {/* Header */}
      <header className="glass border-b border-surface-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-header bg-gradient-to-r from-accent to-[#A855F7] bg-clip-text text-transparent">
              MXF Media Reader
            </h1>
            {currentFile && (
              <span className="text-body text-muted truncate max-w-md">
                {currentFile.split('/').pop()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between bg-danger/80 border-b border-danger px-6 py-3 text-app-white text-body">
          <span>{error}</span>
          <button
            className="ml-4 text-app-white/70 hover:text-app-white text-subheader leading-none"
            onClick={dismissError}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <DriveBrowser
          onFileSelect={handleFileSelect}
          onMergeRequest={(paths) => setMergeClipPaths(paths)}
        />
      </div>

      {/* Transcode/streaming progress — not needed for mxfstream (instant) */}

      {/* Video Player Overlay */}
      {playback.status === 'ready' && videoPath && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-black">
              <div className="text-center">
                <div className="text-danger text-subheader mb-2">Video player crashed</div>
                <button className="btn-primary" onClick={closePlayer}>
                  Close Player
                </button>
              </div>
            </div>
          }
        >
          <VideoPlayer
            videoPath={videoPath}
            isTranscoded={isTranscoded}
            isMxfStream={isMxfStream}
            metadata={
              metadata
                ? {
                    // Prefer XML sidecar startTimecode (correctly BCD-decoded);
                    // fall back to FFprobe timecode tag from the proxy/MXF
                    startTimecode: xmlMetadata?.startTimecode || metadata.timecode || undefined,
                    duration: metadata.duration.toString(),
                    // Prefer XML frameRate (e.g. "29.97p"); fall back to FFprobe framerate number
                    frameRate: xmlMetadata?.frameRate || metadata.framerate.toString(),
                    dropFrame: xmlMetadata?.dropFrame ?? false,
                    audio: metadata.audio
                  }
                : undefined
            }
            onClose={closePlayer}
          />
        </ErrorBoundary>
      )}

      {/* Merge Panel Overlay */}
      {mergeClipPaths && mergeClipPaths.length > 0 && (
        <MergePanel clipPaths={mergeClipPaths} onClose={() => setMergeClipPaths(null)} />
      )}
    </div>
  )
}

function AppWithBoundary(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

export default AppWithBoundary
