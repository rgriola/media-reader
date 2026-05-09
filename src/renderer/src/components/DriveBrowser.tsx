import { useState, useEffect, useCallback, useRef } from 'react'
import { formatFileSize, formatFramesDuration } from '../utils/formatters'
import { MetadataViewer } from './MetadataViewer'
import { Accordion } from './metadata/Accordion'
import { FileThumbnail, PhotoCard } from './drive/PhotoCard'
import { PhotoViewer } from './drive/PhotoViewer'
import { isRawPhotoExtension } from './drive/photoUtils'
import type { ExternalDrive, XMLMetadata, PhotoFile } from '../types'

interface DriveBrowserProps {
  onFileSelect: (filepath: string, xmlMetadata?: XMLMetadata, forceOriginal?: boolean) => void
  onClose?: () => void
  onDriveSelect?: (drivePath: string) => void
  initialSelectedDrivePath?: string | null
  onMergeRequest?: (clipPaths: string[]) => void
}

/** Grid of photo cards for the Photos tab */
function PhotosPanel({ photos }: { photos: PhotoFile[] }): React.ReactElement {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [previewPaths, setPreviewPaths] = useState<Record<string, string>>({})
  const [autoPreviewsRemaining, setAutoPreviewsRemaining] = useState(0)
  const previewPathsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    previewPathsRef.current = previewPaths
  }, [previewPaths])

  useEffect(() => {
    setViewerIndex(null)
    const persistedPreviews = photos.reduce<Record<string, string>>((acc, photo) => {
      if (photo.extractedPreview) {
        acc[photo.path] = photo.extractedPreview
      }
      return acc
    }, {})
    setPreviewPaths(persistedPreviews)
    setAutoPreviewsRemaining(0)
  }, [photos])

  const handlePreviewReady = useCallback((photoPath: string, previewPath: string): void => {
    setPreviewPaths((prev) => {
      if (prev[photoPath] === previewPath) return prev
      return { ...prev, [photoPath]: previewPath }
    })
  }, [])

  // Auto-generate previews for RAW files that have no JPG companion.
  // Runs sequentially to avoid saturating CPU/disk while scanning large cards.
  useEffect(() => {
    let cancelled = false
    const rawWithoutJpeg = photos.filter(
      (photo) =>
        isRawPhotoExtension(photo.extension) && !photo.jpgCompanion && !photo.extractedPreview
    )

    if (rawWithoutJpeg.length === 0) {
      setAutoPreviewsRemaining(0)
      return () => {
        // No-op cleanup
      }
    }

    const runAutoPreviewQueue = async (): Promise<void> => {
      let remaining = rawWithoutJpeg.filter((photo) => !previewPathsRef.current[photo.path]).length
      setAutoPreviewsRemaining(remaining)

      for (const photo of rawWithoutJpeg) {
        if (cancelled) return
        if (previewPathsRef.current[photo.path]) {
          remaining = Math.max(0, remaining - 1)
          setAutoPreviewsRemaining(remaining)
          continue
        }

        const result = await window.api.extractRawPreview(photo.path)
        if (cancelled) return

        if (result.success && result.previewPath) {
          handlePreviewReady(photo.path, result.previewPath)
        }

        remaining = Math.max(0, remaining - 1)
        setAutoPreviewsRemaining(remaining)
      }
    }

    runAutoPreviewQueue().catch((error: unknown) => {
      console.error('Automatic RAW preview extraction failed:', error)
      if (!cancelled) {
        setAutoPreviewsRemaining(0)
      }
    })

    return () => {
      cancelled = true
    }
  }, [handlePreviewReady, photos])

  return (
    <div className="p-4">
      {autoPreviewsRemaining > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-accent/30 bg-accent/10 text-special text-accent">
          Generating RAW thumbnails... {autoPreviewsRemaining} remaining
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.path}
            photo={photo}
            externalPreviewPath={previewPaths[photo.path] ?? null}
            onPreviewReady={handlePreviewReady}
            onOpenViewer={() => setViewerIndex(index)}
          />
        ))}
      </div>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          previewPaths={previewPaths}
          onPreviewReady={handlePreviewReady}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}

export function DriveBrowser({
  onFileSelect,
  onClose,
  onDriveSelect,
  initialSelectedDrivePath,
  onMergeRequest
}: DriveBrowserProps): React.ReactElement {
  const [drives, setDrives] = useState<ExternalDrive[]>([])
  const [loading, setLoading] = useState(true)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [selectedDrive, setSelectedDrive] = useState<ExternalDrive | null>(null)
  const [showNetworkSection, setShowNetworkSection] = useState(true)
  const [activeTab, setActiveTab] = useState<'video' | 'photos'>('video')
  // Track which drive is currently being ejected (by path) and any eject error
  const [ejectingDrive, setEjectingDrive] = useState<string | null>(null)
  const [ejectError, setEjectError] = useState<string | null>(null)

  // Determine if we're in modal mode (has onClose) or main view mode
  const isModal = !!onClose

  useEffect(() => {
    loadDrives()

    // Listen for drive mount/unmount events
    const cleanupMounted = window.api.onDriveMounted((drive: ExternalDrive) => {
      setDrives((prev) => {
        // Prevent duplicates - check if drive already exists
        const exists = prev.some((d) => d.path === drive.path)
        if (exists) {
          console.log(`Drive already exists: ${drive.path}`)
          return prev
        }
        return [...prev, drive]
      })

      // Show notification
      if (drive.isSonyCard) {
        console.log(`Sony camera card detected: ${drive.name} (${drive.fileCount} MXF files)`)
      }
    })

    const cleanupUnmounted = window.api.onDriveUnmounted((drivePath: string) => {
      setDrives((prev) => prev.filter((d) => d.path !== drivePath))
      if (selectedDrive?.path === drivePath) {
        setSelectedDrive(null)
      }
    })

    return () => {
      cleanupMounted()
      cleanupUnmounted()
    }
  }, [selectedDrive?.path])

  // Auto-select drive if initialSelectedDrivePath is provided
  useEffect(() => {
    if (initialSelectedDrivePath && drives.length > 0) {
      const drive = drives.find((d) => d.path === initialSelectedDrivePath)
      if (drive) {
        setSelectedDrive(drive)
        if (onDriveSelect) {
          onDriveSelect(drive.path)
        }
      }
    }
  }, [initialSelectedDrivePath, drives, onDriveSelect])

  // Reset to video tab when selected drive changes
  useEffect(() => {
    setActiveTab('video')
  }, [selectedDrive?.path])

  const loadDrives = async (): Promise<void> => {
    setLoading(true)
    setScanStatus(null)
    const unsubscribeProgress = window.api.onScanProgress((msg) => {
      setScanStatus(msg)
    })
    try {
      const externalDrives = await window.api.getExternalDrives()
      setDrives(externalDrives)
    } catch (error) {
      console.error('Error loading drives:', error)
    } finally {
      unsubscribeProgress()
      setScanStatus(null)
      setLoading(false)
    }
  }

  const handleFileClick = (
    filepath: string,
    xmlMetadata?: XMLMetadata,
    forceOriginal?: boolean
  ): void => {
    onFileSelect(filepath, xmlMetadata, forceOriginal)
    if (onClose) {
      onClose()
    }
  }

  const handleChooseFile = async (): Promise<void> => {
    const filepath = await window.api.selectFile()
    if (filepath) {
      // forceOriginal=true: play the file the user explicitly chose, not a proxy.
      // App.tsx will route by extension (MP4 → local://, MXF → mxfstream://)
      handleFileClick(filepath, undefined, true)
    }
  }

  const handleEjectDrive = async (e: React.MouseEvent, drivePath: string): Promise<void> => {
    e.stopPropagation()
    setEjectingDrive(drivePath)
    setEjectError(null)
    const result = await window.api.ejectDrive(drivePath)
    setEjectingDrive(null)
    if (!result.success) {
      setEjectError(result.error ?? 'Eject failed')
      // Auto-clear the error after 4 seconds
      setTimeout(() => setEjectError(null), 4000)
    }
    // On success the drive-unmounted IPC event fires and removes the drive from the list
  }

  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50'
          : 'h-full flex flex-col'
      }
    >
      <div
        className={
          isModal
            ? 'glass rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col m-4'
            : 'h-full flex flex-col'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <div>
            <h2 className="page-title">Browse Media Files</h2>
            <p className="text-body text-muted mt-1">
              {drives.length === 0
                ? 'No external drives detected'
                : `${drives.length} drive(s) connected`}
            </p>
          </div>
          {isModal && (
            <button onClick={onClose} className="btn-icon">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Drive List */}
          <div className="w-1/3 border-r border-surface-border overflow-y-auto">
            {/* Choose File Button — always visible */}
            <div className="p-2 pb-0">
              <div className="mb-3">
                <button
                  onClick={handleChooseFile}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-surface-border hover:border-accent hover:bg-accent/10 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-raised group-hover:bg-accent/20 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg
                      className="w-4 h-4 text-muted group-hover:text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="item-title group-hover:text-accent transition-colors">
                      Choose File…
                    </div>
                    <div className="text-special text-muted">MXF, MP4, MOV and more</div>
                  </div>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
                  <p className="text-muted">Scanning drives...</p>
                  {!!scanStatus && (
                    <p className="text-special text-muted/60 mt-1 px-4 truncate max-w-[200px]">
                      {scanStatus}
                    </p>
                  )}
                </div>
              </div>
            ) : drives.length === 0 ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 text-muted mx-auto mb-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    />
                  </svg>
                  <p className="text-muted">No external drives found</p>
                  <p className="text-special text-muted mt-2">
                    Insert an SD card or external drive
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2">
                {/* Sony Card Notice */}
                {drives.length > 0 && !drives.some((d) => d.isSonyCard) && (
                  <div className="mb-4 p-4 bg-warning/10 border border-warning/30 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <div className="flex-1">
                        <p className="alert-title text-warning">No Sony Card Found</p>
                        <p className="text-special text-warning/70 mt-1">
                          If a card is connected check the computer sees it.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Choose File Button — rendered in the always-visible block above */}

                {/* Local Drives Section */}
                {drives.filter((d) => !d.isNetworkDrive).length > 0 && (
                  <div className="mb-4">
                    <div className="px-2 py-1 section-label">Local Drives</div>
                    {drives
                      .filter((d) => !d.isNetworkDrive)
                      .map((drive) => (
                        <div key={drive.path} className="relative mb-2">
                          <button
                            onClick={() => {
                              setSelectedDrive(drive)
                              if (onDriveSelect) {
                                onDriveSelect(drive.path)
                              }
                            }}
                            className={`w-full text-left p-4 rounded-lg transition-colors pr-10 ${
                              selectedDrive?.path === drive.path
                                ? 'bg-accent text-app-white'
                                : 'hover:bg-surface-raised'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="text-3xl">{drive.isSonyCard ? '📹' : '💾'}</div>
                              <div className="flex-1 min-w-0">
                                <div className="item-title">{drive.name}</div>
                                {drive.cameraModel ? (
                                  <div className="item-subtitle">{drive.cameraModel}</div>
                                ) : (
                                  drive.isSonyCard && (
                                    <div className="item-subtitle">Sony Camera Card</div>
                                  )
                                )}
                                <div
                                  className={`text-body mt-1 ${
                                    selectedDrive?.path === drive.path
                                      ? 'text-app-white/80'
                                      : 'text-muted'
                                  }`}
                                >
                                  {drive.fileCount} video file{drive.fileCount !== 1 ? 's' : ''}
                                  {(drive.photos?.length ?? 0) > 0
                                    ? `, ${drive.photos?.length} photo${drive.photos?.length === 1 ? '' : 's'}`
                                    : ''}
                                </div>
                                <div
                                  className={`text-special ${
                                    selectedDrive?.path === drive.path
                                      ? 'text-app-white/70'
                                      : 'text-muted'
                                  }`}
                                >
                                  {formatFileSize(drive.totalSize)}
                                </div>
                                {!!drive.mediaProMissing && (
                                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded border border-warning/40 bg-warning/10 text-warning text-special">
                                    <span>⚠</span> Index file missing
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Eject button — only for /Volumes/ paths (physical drives) */}
                          {drive.path.startsWith('/Volumes/') && (
                            <button
                              id={`eject-${drive.name.replace(/\s+/g, '-')}`}
                              onClick={(e) => handleEjectDrive(e, drive.path)}
                              disabled={ejectingDrive === drive.path}
                              title={`Eject ${drive.name}`}
                              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md transition-colors text-muted hover:text-app-white hover:bg-danger/70 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {ejectingDrive === drive.path ? (
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" />
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 11l7-7 7 7M5 19h14"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      ))}

                    {/* Eject error toast */}
                    {ejectError && (
                      <div className="mx-1 mb-2 px-3 py-2 rounded-lg bg-danger/20 border border-danger/40 text-danger text-special">
                        ⚠ {ejectError}
                      </div>
                    )}
                  </div>
                )}

                {/* Network Drives Section */}
                {drives.filter((d) => d.isNetworkDrive).length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-2 py-1 mb-2">
                      <div className="section-label">Network Drives</div>
                      <button
                        onClick={() => setShowNetworkSection(!showNetworkSection)}
                        className="btn-icon p-1"
                        title={showNetworkSection ? 'Collapse' : 'Expand'}
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${showNetworkSection ? '' : '-rotate-90'}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    </div>
                    {showNetworkSection &&
                      drives
                        .filter((d) => d.isNetworkDrive)
                        .map((drive) => (
                          <button
                            key={drive.path}
                            onClick={() => setSelectedDrive(drive)}
                            className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${
                              selectedDrive?.path === drive.path
                                ? 'bg-accent text-app-white'
                                : 'hover:bg-surface-raised'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="text-3xl">🌐</div>
                              <div className="flex-1 min-w-0">
                                <div className="item-title">{drive.name}</div>
                                <div
                                  className={`text-special font-bold ${
                                    selectedDrive?.path === drive.path
                                      ? 'text-app-white'
                                      : 'text-purple'
                                  }`}
                                >
                                  Network Drive
                                </div>
                                <div
                                  className={`text-body mt-1 ${
                                    selectedDrive?.path === drive.path
                                      ? 'text-app-white/80'
                                      : 'text-muted'
                                  }`}
                                >
                                  {drive.fileCount} video file{drive.fileCount !== 1 ? 's' : ''}
                                  {(drive.photos?.length ?? 0) > 0
                                    ? `, ${drive.photos?.length} photo${drive.photos?.length === 1 ? '' : 's'}`
                                    : ''}
                                </div>
                                <div
                                  className={`text-special ${
                                    selectedDrive?.path === drive.path
                                      ? 'text-app-white/70'
                                      : 'text-muted'
                                  }`}
                                >
                                  {formatFileSize(drive.totalSize)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto">
            {selectedDrive ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="panel-title mb-1">{selectedDrive.name}</h3>
                    <p className="item-meta">{selectedDrive.path}</p>
                  </div>
                  {activeTab === 'video' &&
                    onMergeRequest &&
                    selectedDrive.mxfFiles.length >= 2 && (
                      <button
                        onClick={() => onMergeRequest(selectedDrive.mxfFiles.map((f) => f.path))}
                        className="px-4 py-2.5 bg-gradient-to-r from-success to-teal hover:from-success/80 hover:to-teal/80 rounded-lg text-body font-bold transition-all shadow-lg flex items-center gap-2"
                      >
                        <span>🎬</span> Merge All Clips
                      </button>
                    )}
                </div>

                {/* Video / Photos tab bar — only on mirrorless cards with photos */}
                {selectedDrive.photos && selectedDrive.photos.length > 0 && (
                  <div className="flex gap-1 mb-4 p-1 bg-surface rounded-lg w-fit">
                    <button
                      id="tab-video"
                      onClick={() => setActiveTab('video')}
                      className={`px-4 py-1.5 rounded text-body font-bold transition-colors ${
                        activeTab === 'video' ? 'bg-accent text-app-white' : 'text-app-white'
                      }`}
                    >
                      🎬 Video ({selectedDrive.mxfFiles.length})
                    </button>
                    <button
                      id="tab-photos"
                      onClick={() => setActiveTab('photos')}
                      className={`px-4 py-1.5 rounded text-body font-bold transition-colors ${
                        activeTab === 'photos'
                          ? 'bg-accent text-app-white'
                          : 'text-muted hover:text-app-white'
                      }`}
                    >
                      📷 Photos ({selectedDrive.photos.length})
                    </button>
                  </div>
                )}

                {/* Card integrity warnings — shown when MEDIAPRO.XML reveals issues */}
                {!!selectedDrive.mediaProMissing && (
                  <div className="mb-4 p-3 rounded-lg border border-warning/40 bg-warning/10 flex items-start gap-2">
                    <span className="text-warning text-subheader">ℹ</span>
                    <div>
                      <p className="alert-title text-warning">No card index file found</p>
                      <p className="text-special text-muted mt-0.5">
                        MEDIAPRO.XML is missing — filesystem scan used. This card may have been
                        copied without its index.
                      </p>
                    </div>
                  </div>
                )}
                {!selectedDrive.mediaProMissing &&
                  !!selectedDrive.cardIntegrity &&
                  selectedDrive.cardIntegrity.missingMxf.length > 0 && (
                    <div className="mb-4 p-3 rounded-lg border border-warning/40 bg-warning/10 flex items-start gap-2">
                      <span className="text-warning text-subheader">⚠</span>
                      <div>
                        <p className="alert-title text-warning">
                          {selectedDrive.cardIntegrity.missingMxf.length} of{' '}
                          {selectedDrive.cardIntegrity.totalExpected} clips missing from card
                        </p>
                        <p className="text-special text-muted mt-0.5">
                          This card may have been partially copied. Missing clips:{' '}
                          {selectedDrive.cardIntegrity.missingMxf.join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                {activeTab === 'photos' &&
                selectedDrive.photos &&
                selectedDrive.photos.length > 0 ? (
                  <PhotosPanel photos={selectedDrive.photos} />
                ) : activeTab === 'video' && selectedDrive.mxfFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted">No video files found on this drive</p>
                  </div>
                ) : activeTab === 'video' ? (
                  <div className="space-y-2">
                    {selectedDrive.mxfFiles.map((file) => {
                      const isEmpty = file.size === 0
                      return (
                        <div
                          key={file.path}
                          className={`card flex gap-4 items-start ${isEmpty ? 'opacity-50' : ''}`}
                          title={
                            isEmpty
                              ? 'This file is empty (0 bytes) — the recording was interrupted before any data was saved.'
                              : undefined
                          }
                        >
                          {/* Metadata Section */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="card-value-mono truncate">{file.name}</div>
                              {isEmpty ? (
                                <span className="badge-danger-deep">⚠ Empty File</span>
                              ) : file.proxy ? (
                                <span className="badge-success">PROXY</span>
                              ) : (
                                <span className="badge-muted">NO PROXY</span>
                              )}
                            </div>
                            <div className="text-special text-muted truncate">{file.path}</div>

                            {isEmpty && (
                              <p className="text-special text-danger mt-1">
                                0 bytes — recording was interrupted before data was written.
                              </p>
                            )}

                            {(!!file.durationFrames || !!file.audioChannels) && (
                              <div className="flex items-center gap-3 mt-1">
                                {!!file.durationFrames && !!file.fps && (
                                  <span className="text-special text-muted">
                                    ⏱ {formatFramesDuration(file.durationFrames, file.fps)}
                                  </span>
                                )}
                                {!!file.audioChannels && (
                                  <span className="text-special text-muted">
                                    🎵 {file.audioChannels}ch
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Metadata Display - Organized by Source */}
                            {file.metadata && (
                              <div className="mt-2 space-y-2">
                                {/* XML Metadata Section */}
                                <Accordion title="XML Metadata" defaultOpen accent="blue">
                                  <div className="space-y-0.5">
                                    {file.metadata.startTimecode && (
                                      <div className="meta-row">
                                        <span className="card-label">Start TC:</span>
                                        <span className="card-value-accent">
                                          {file.metadata.startTimecode}
                                        </span>
                                        {file.metadata.dropFrame && (
                                          <span className="badge-warning text-special">(DF)</span>
                                        )}
                                      </div>
                                    )}
                                    {file.metadata.duration && (
                                      <div className="meta-row">
                                        <span className="card-label">Duration:</span>
                                        <span className="card-value-accent">
                                          {file.metadata.duration}
                                        </span>
                                      </div>
                                    )}
                                    {file.metadata.frameRate && (
                                      <div className="meta-row">
                                        <span className="card-label">Frame Rate:</span>
                                        <span className="card-value">
                                          {file.metadata.frameRate}
                                        </span>
                                      </div>
                                    )}
                                    {file.metadata.resolution && (
                                      <div className="meta-row">
                                        <span className="card-label">Resolution:</span>
                                        <span className="card-value">
                                          {file.metadata.resolution}
                                        </span>
                                      </div>
                                    )}
                                    {file.metadata.videoCodec && (
                                      <div className="meta-row">
                                        <span className="card-label">Codec:</span>
                                        <span className="card-value">
                                          {file.metadata.videoCodec}
                                        </span>
                                      </div>
                                    )}
                                    {file.metadata.aspectRatio && (
                                      <div className="meta-row">
                                        <span className="card-label">Aspect Ratio:</span>
                                        <span className="card-value">
                                          {file.metadata.aspectRatio}
                                        </span>
                                      </div>
                                    )}
                                    {file.metadata.creationDate && (
                                      <div className="meta-row">
                                        <span className="card-label">Created:</span>
                                        <span className="card-value">
                                          {new Date(file.metadata.creationDate).toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </Accordion>

                                {/* Proxy File Section */}
                                {!!file.proxy && (
                                  <Accordion title="Proxy File" defaultOpen accent="green">
                                    <div className="meta-row">
                                      <span className="card-label">Path:</span>
                                      <span className="card-value truncate">{file.proxy}</span>
                                    </div>
                                  </Accordion>
                                )}

                                {/* Video File Section */}
                                <Accordion
                                  title={`${file.path.split('.').pop()?.toUpperCase() ?? 'Video'} File`}
                                  accent="orange"
                                >
                                  <div className="space-y-0.5">
                                    <div className="meta-row">
                                      <span className="card-label">Filename:</span>
                                      <span className="card-value-mono">{file.name}</span>
                                    </div>
                                    {file.thumbnail && (
                                      <div className="meta-row">
                                        <span className="card-label">Thumbnail:</span>
                                        <span className="card-value">Available</span>
                                      </div>
                                    )}
                                  </div>
                                </Accordion>

                                {/* Complete XML Data */}
                                {!!file.metadata?.rawXML && (
                                  <Accordion title="Complete XML Data" accent="muted">
                                    <MetadataViewer metadata={file.metadata} />
                                  </Accordion>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Thumbnail play target */}
                          <button
                            type="button"
                            onClick={() => handleFileClick(file.path, file.metadata)}
                            disabled={isEmpty}
                            aria-label={
                              isEmpty
                                ? `${file.name} is empty and cannot be played`
                                : `Play ${file.name}`
                            }
                            title={isEmpty ? undefined : `Play ${file.name}`}
                            className={`relative shrink-0 rounded overflow-hidden transition-shadow ${
                              isEmpty
                                ? 'cursor-not-allowed'
                                : 'group cursor-pointer hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app-black'
                            }`}
                          >
                            <FileThumbnail thumbnail={file.thumbnail} name={file.name}>
                              <div className="w-60 h-[135px] flex items-center justify-center bg-surface rounded">
                                <svg
                                  className="w-20 h-20 text-accent"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
                                  />
                                </svg>
                              </div>
                            </FileThumbnail>

                            {!isEmpty && (
                              <div className="absolute inset-0 flex items-center justify-center bg-app-black/25 group-hover:bg-app-black/40 transition-colors">
                                <div className="w-12 h-12 rounded-full bg-app-black/70 border border-app-white/30 flex items-center justify-center shadow-lg">
                                  <svg
                                    className="w-5 h-5 text-app-white ml-0.5"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                  >
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                    />
                  </svg>
                  <p>Select a drive to view files</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-border flex justify-between items-center">
          <button
            onClick={loadDrives}
            disabled={loading}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Scanning...' : '🔄 Refresh'}
          </button>
          {isModal && (
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
