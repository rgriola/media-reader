import { useState, useMemo, useCallback } from 'react'
import { useMediaStore } from './store/mediaStore'
import { DriveBrowser } from './components/DriveBrowser'
import { VideoPlayer } from './components/VideoPlayer'
import { MergePanel } from './components/MergePanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import type { XMLMetadata, BadgeType } from './types'

type PlaybackState =
  | { status: 'idle' }
  | {
      status: 'ready'
      videoPath: string
      badgeType: BadgeType
      // Non-null when a proxy is active — enables the "Play Original " toggle
      mainFilePath: string | null
      isMxfStream: boolean
    }

/**
 * Returns true for container formats Chromium can play natively without FFmpeg.
 * MXF and other professional containers still need mxfstream:// transcoding.
 */
function isBrowserNativeFormat(filepath: string): boolean {
  const ext = filepath.split('.').pop()?.toLowerCase() ?? ''
  return ['mp4', 'mov', 'm4v', 'webm', 'ogg'].includes(ext)
}

function App(): React.JSX.Element {
  const [playback, setPlayback] = useState<PlaybackState>({ status: 'idle' })
  const [mergeClipPaths, setMergeClipPaths] = useState<string[] | null>(null)
  const [driveRefreshSignal, setDriveRefreshSignal] = useState(0)
  const [xmlMetadata, setXmlMetadata] = useState<XMLMetadata | undefined>(undefined)
  const { metadata, error, loadFile } = useMediaStore()

  const dismissError = (): void => {
    useMediaStore.getState().setError(null)
  }

  const closePlayer = (): void => {
    setPlayback({ status: 'idle' })
  }

  const handleRefreshDrives = useCallback((): void => {
    setDriveRefreshSignal((prev) => prev + 1)
  }, [])

  const handleFileSelect = async (
    filepath: string,
    xml?: XMLMetadata,
    forceOriginal?: boolean
  ): Promise<void> => {
    const success = await loadFile(filepath)
    if (!success) return

    setXmlMetadata(xml)

    const { proxy: freshProxy, currentFile: freshFile } = useMediaStore.getState()
    const isNative = isBrowserNativeFormat(filepath)

    if (!forceOriginal && freshProxy?.exists === true && freshProxy?.path) {
      // ── Proxy available: play proxy via local://, stash main path for toggle ──
      console.log('Routing: proxy →', freshProxy.path)
      setPlayback({
        status: 'ready',
        videoPath: freshProxy.path,
        badgeType: 'proxy',
        mainFilePath: filepath, // enables "Play Original " button in player
        isMxfStream: false
      })
    } else if (isNative && freshFile) {
      // ── No proxy, but file is browser-native (MP4/MOV) — serve directly ──
      console.log('Routing: native MP4 → local://', freshFile)
      setPlayback({
        status: 'ready',
        videoPath: freshFile,
        badgeType: 'native-mp4',
        mainFilePath: null,
        isMxfStream: false
      })
    } else if (freshFile) {
      // ── No proxy, non-native (MXF etc) — live transcode via mxfstream:// ──
      console.log(
        forceOriginal ? 'Routing: forced MXF stream →' : 'Routing: MXF stream (no proxy) →',
        freshFile
      )
      const encodedPath = freshFile
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
      setPlayback({
        status: 'ready',
        videoPath: `mxfstream://${encodedPath}`,
        badgeType: 'mxf-stream',
        mainFilePath: null,
        isMxfStream: true
      })
    }
  }

  // Called from the player's "Play Original " button — switches proxy → main MP4
  const handleSwitchToMain = (): void => {
    if (playback.status !== 'ready' || !playback.mainFilePath) return
    const mainPath = playback.mainFilePath
    console.log('Routing: switching to full file →', mainPath)
    setPlayback({
      status: 'ready',
      videoPath: mainPath,
      badgeType: 'native-mp4',
      mainFilePath: null, // no further toggle once on the main file
      isMxfStream: false
    })
  }

  const videoPath = useMemo(() => {
    if (playback.status === 'ready') return playback.videoPath
    return null
  }, [playback])

  const badgeType: BadgeType = playback.status === 'ready' ? playback.badgeType : 'proxy'
  const isMxfStream = playback.status === 'ready' && playback.isMxfStream

  return (
    <div className="flex flex-col h-screen bg-app-black text-app-white">
      {/* Header */}
      <header className="glass border-b border-surface-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-header bg-gradient-to-r from-accent to-[#A855F7] bg-clip-text text-transparent">
              Media Reader - Fixer
            </h1>
          </div>
          <button onClick={handleRefreshDrives} className="btn-secondary">
            🔄 Refresh
          </button>
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
          refreshSignal={driveRefreshSignal}
        />
      </div>

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
            badgeType={badgeType}
            isMxfStream={isMxfStream}
            hasMainFile={playback.status === 'ready' && !!playback.mainFilePath}
            onSwitchToMain={handleSwitchToMain}
            metadata={
              metadata
                ? {
                    startTimecode: xmlMetadata?.startTimecode || metadata.timecode || undefined,
                    duration: metadata.duration.toString(),
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
