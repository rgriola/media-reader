import { useState, useMemo } from 'react'
import { useMediaStore } from './store/mediaStore'
import { DriveBrowser } from './components/DriveBrowser'
import { VideoPlayer } from './components/VideoPlayer'
import { MergePanel } from './components/MergePanel'
import { ErrorBoundary } from './components/ErrorBoundary'

function App(): React.JSX.Element {
  const [showVideoPlayer, setShowVideoPlayer] = useState(false)
  const [mergeClipPaths, setMergeClipPaths] = useState<string[] | null>(null)
  const { currentFile, metadata, proxy, error, loadFile } = useMediaStore()

  const dismissError = (): void => {
    useMediaStore.getState().setError(null)
  }

  const handleFileSelect = async (filepath: string): Promise<void> => {
    const success = await loadFile(filepath)
    if (success) {
      setShowVideoPlayer(true)
    }
  }

  const videoPath = useMemo(() => {
    // Only use proxy if it explicitly exists (not just defined)
    if (proxy?.exists === true && proxy?.path) {
      console.log('Using proxy file:', proxy.path)
      return proxy.path
    }
    // Fall back to original MXF file
    console.log('Using original MXF file:', currentFile)
    return currentFile || null
  }, [proxy, currentFile])

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

      {/* Main Content - Always show DriveBrowser */}
      <div className="flex-1 overflow-hidden">
        <DriveBrowser
          onFileSelect={handleFileSelect}
          onMergeRequest={(paths) => setMergeClipPaths(paths)}
        />
      </div>

      {/* Video Player Overlay */}
      {showVideoPlayer && videoPath && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
              <div className="text-center">
                <div className="text-red-400 text-lg mb-2">Video player crashed</div>
                <button
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  onClick={() => setShowVideoPlayer(false)}
                >
                  Close Player
                </button>
              </div>
            </div>
          }
        >
          <VideoPlayer
            videoPath={videoPath}
            metadata={
              metadata
                ? {
                  startTimecode: metadata.timecode,
                  duration: metadata.duration.toString(),
                  frameRate: metadata.framerate.toString(),
                  dropFrame: false, // MXF files typically don't use drop frame
                  audio: metadata.audio
                }
                : undefined
            }
            onClose={() => setShowVideoPlayer(false)}
          />
        </ErrorBoundary>
      )}

      {/* Merge Panel Overlay */}
      {mergeClipPaths && mergeClipPaths.length > 0 && (
        <MergePanel
          clipPaths={mergeClipPaths}
          onClose={() => setMergeClipPaths(null)}
        />
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
