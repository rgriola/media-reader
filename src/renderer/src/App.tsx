import { useState, useMemo } from 'react'
import { useMediaStore } from './store/mediaStore'
import { DriveBrowser } from './components/DriveBrowser'
import { VideoPlayer } from './components/VideoPlayer'
import { MergePanel } from './components/MergePanel'
import { ErrorBoundary } from './components/ErrorBoundary'

type PlaybackState =
  | { status: 'idle' }
  | { status: 'ready'; videoPath: string; isMxfStream: boolean }

function App(): React.JSX.Element {
  const [playback, setPlayback] = useState<PlaybackState>({ status: 'idle' })
  const [mergeClipPaths, setMergeClipPaths] = useState<string[] | null>(null)
  const { currentFile, metadata, error, loadFile } = useMediaStore()

  const dismissError = (): void => {
    useMediaStore.getState().setError(null)
  }

  // Clean up player state on close
  const closePlayer = (): void => {
    setPlayback({ status: 'idle' })
  }

  const handleFileSelect = async (filepath: string): Promise<void> => {
    const success = await loadFile(filepath)
    if (!success) return

    const { proxy: freshProxy, currentFile: freshFile } = useMediaStore.getState()

    if (freshProxy?.exists === true && freshProxy?.path) {
      // Proxy MP4 — play directly via local:// protocol (no encoding needed)
      console.log('Using proxy file:', freshProxy.path)
      setPlayback({ status: 'ready', videoPath: freshProxy.path, isMxfStream: false })
    } else if (freshFile) {
      // No proxy — stream MXF live via mxfstream:// (FFmpeg ultrafast pipe, no temp file)
      console.log('No proxy — streaming MXF directly:', freshFile)
      // Encode the path for URL: preserve slashes but encode spaces/special chars
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
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="glass border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MXF Media Reader
            </h1>
            {currentFile && (
              <span className="text-sm text-gray-400 truncate max-w-md">
                {currentFile.split('/').pop()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-900/80 border-b border-red-700 px-6 py-3 text-red-100 text-sm">
          <span>{error}</span>
          <button
            className="ml-4 text-red-300 hover:text-white text-lg leading-none"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
              <div className="text-center">
                <div className="text-red-400 text-lg mb-2">Video player crashed</div>
                <button
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  onClick={closePlayer}
                >
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
                    startTimecode: metadata.timecode,
                    duration: metadata.duration.toString(),
                    frameRate: metadata.framerate.toString(),
                    dropFrame: false,
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
