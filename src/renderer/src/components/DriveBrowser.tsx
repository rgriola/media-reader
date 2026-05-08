import { useState, useEffect, useCallback, useRef } from 'react'
import { formatFileSize, formatFramesDuration } from '../utils/formatters'
import { MetadataViewer } from './MetadataViewer'
import type { ExternalDrive, XMLMetadata, PhotoFile, PhotoMetadata } from '../types'

interface DriveBrowserProps {
  onFileSelect: (filepath: string, xmlMetadata?: XMLMetadata, forceOriginal?: boolean) => void
  onClose?: () => void
  onDriveSelect?: (drivePath: string) => void
  initialSelectedDrivePath?: string | null
  onMergeRequest?: (clipPaths: string[]) => void
}

function FileThumbnail({
  thumbnail,
  name,
  children
}: {
  thumbnail?: string
  name: string
  children: React.ReactNode
}): React.ReactElement {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="flex-shrink-0">
      {thumbnail && !imgFailed ? (
        <img
          src={`local://${thumbnail}`}
          alt={name}
          className="w-60 h-[135px] object-cover rounded bg-surface"
          onError={() => setImgFailed(true)}
        />
      ) : (
        children
      )}
    </div>
  )
}

/** Formats a metadata row label+value pair */
function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-2 py-0.5 border-b border-surface-border/40 last:border-0">
      <span className="text-special text-muted shrink-0">{label}</span>
      <span className="text-special text-app-white/90 text-right truncate">{value}</span>
    </div>
  )
}

/** Groups of metadata to display in the accordion */
function PhotoMetadataAccordion({
  photo,
  previewPath
}: {
  photo: PhotoFile
  previewPath: string | null
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<PhotoMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Refs guard against duplicate fetches without storing in React state
  const metaRef = useRef<PhotoMetadata | null>(null)
  const loadingRef = useRef(false)

  // Derive loading — avoids calling setState inside an effect body
  const loading = open && !meta && !error

  // Simple toggle — pure functional updater
  const handleToggle = useCallback((): void => {
    setOpen((prev) => !prev)
  }, [])

  // When accordion opens, kick off a one-shot metadata fetch.
  // Only sets state in the async callback (never synchronously in the body).
  useEffect(() => {
    if (!open || metaRef.current || loadingRef.current) return
    loadingRef.current = true
    const sourcePath = photo.jpgCompanion ?? previewPath ?? photo.path
    window.api.getPhotoMetadata(sourcePath).then((result) => {
      loadingRef.current = false
      if (result.success && result.metadata) {
        metaRef.current = result.metadata
        setMeta(result.metadata)
      } else {
        setError(result.error ?? 'Could not read metadata')
      }
    })
  }, [open, photo.jpgCompanion, photo.path, previewPath])

  return (
    <div className="border-t border-surface-border/60">
      {/* Accordion trigger */}
      <button
        id={`photo-meta-toggle-${photo.name}`}
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-special text-muted hover:text-app-white hover:bg-surface-raised/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          EXIF Info
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion body */}
      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-muted text-special">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-accent" />
              Reading EXIF…
            </div>
          ) : !!error ? (
            <p className="text-special text-danger py-1">{error}</p>
          ) : meta ? (
            <div className="mt-1 space-y-0">
              {/* Camera section */}
              {(!!meta.make || !!meta.model) && (
                <div className="mb-2">
                  <div className="text-special font-bold text-accent/80 uppercase tracking-wide mb-1">
                    Camera
                  </div>
                  {!!meta.make && <MetaRow label="Make" value={meta.make} />}
                  {!!meta.model && <MetaRow label="Model" value={meta.model} />}
                  {!!meta.lens && <MetaRow label="Lens" value={meta.lens} />}
                </div>
              )}

              {/* Exposure section */}
              {(!!meta.exposureTime || !!meta.fNumber || !!meta.iso || !!meta.focalLength) && (
                <div className="mb-2">
                  <div className="text-special font-bold text-accent/80 uppercase tracking-wide mb-1">
                    Exposure
                  </div>
                  {!!meta.exposureTime && <MetaRow label="Shutter" value={meta.exposureTime} />}
                  {!!meta.fNumber && <MetaRow label="Aperture" value={meta.fNumber} />}
                  {!!meta.iso && <MetaRow label="ISO" value={meta.iso} />}
                  {!!meta.focalLength && <MetaRow label="Focal Length" value={meta.focalLength} />}
                  {!!meta.focalLengthIn35mm && (
                    <MetaRow label="35mm Equiv." value={meta.focalLengthIn35mm} />
                  )}
                  {!!meta.exposureMode && <MetaRow label="Exp. Mode" value={meta.exposureMode} />}
                  {!!meta.meteringMode && <MetaRow label="Metering" value={meta.meteringMode} />}
                  {!!meta.whiteBalance && (
                    <MetaRow label="White Balance" value={meta.whiteBalance} />
                  )}
                </div>
              )}

              {/* Image section */}
              {(!!meta.width || !!meta.height || !!meta.colorSpace) && (
                <div className="mb-2">
                  <div className="text-special font-bold text-accent/80 uppercase tracking-wide mb-1">
                    Image
                  </div>
                  {!!meta.width && !!meta.height && (
                    <MetaRow label="Resolution" value={`${meta.width} × ${meta.height}`} />
                  )}
                  {!!meta.colorSpace && <MetaRow label="Color Space" value={meta.colorSpace} />}
                </div>
              )}

              {/* Date section */}
              {!!meta.dateTimeOriginal && (
                <div className="mb-2">
                  <div className="text-special font-bold text-accent/80 uppercase tracking-wide mb-1">
                    Date
                  </div>
                  <MetaRow label="Captured" value={meta.dateTimeOriginal} />
                </div>
              )}

              {/* GPS section */}
              {(!!meta.gpsLatitude || !!meta.gpsLongitude) && (
                <div>
                  <div className="text-special font-bold text-accent/80 uppercase tracking-wide mb-1">
                    Location
                  </div>
                  {!!meta.gpsLatitude && <MetaRow label="Lat" value={meta.gpsLatitude} />}
                  {!!meta.gpsLongitude && <MetaRow label="Lon" value={meta.gpsLongitude} />}
                </div>
              )}

              {Object.keys(meta).length === 0 && (
                <p className="text-special text-muted py-1">No EXIF data found in this file.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * Individual photo card inside the Photos panel.
 * - If the photo has a JPG companion (RAW+JPEG mode) → show it directly
 * - If it's a standalone JPG → show it directly
 * - If it's ARW-only → show an "Extract Preview" button that calls FFmpeg
 */
function PhotoCard({ photo }: { photo: PhotoFile }): React.ReactElement {
  const [imgSrc, setImgSrc] = useState<string | null>(
    photo.jpgCompanion ?? (photo.extension !== 'ARW' ? photo.path : null)
  )
  const [imgFailed, setImgFailed] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedPreviewPath, setExtractedPreviewPath] = useState<string | null>(null)

  const handleExtract = useCallback(async (): Promise<void> => {
    setExtracting(true)
    setExtractError(null)
    const result = await window.api.extractArwPreview(photo.path)
    setExtracting(false)
    if (result.success && result.previewPath) {
      setImgSrc(result.previewPath)
      setExtractedPreviewPath(result.previewPath)
      setImgFailed(false)
    } else {
      setExtractError(result.error ?? 'Extraction failed')
    }
  }, [photo.path])

  const displaySrc = imgSrc ? `local://${imgSrc}` : null
  const isCompanionJpg = !!photo.jpgCompanion

  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-surface-border hover:border-accent/50 transition-all group flex flex-col">
      {/* Image area */}
      <div className="relative w-full aspect-[3/2] bg-surface-raised flex items-center justify-center overflow-hidden">
        {displaySrc && !imgFailed ? (
          <img
            src={displaySrc}
            alt={photo.name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : extracting ? (
          <div className="flex flex-col items-center gap-2 text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            <span className="text-special">Extracting…</span>
          </div>
        ) : photo.extension === 'ARW' && !imgSrc ? (
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">📷</span>
            <button
              id={`extract-preview-${photo.name}`}
              onClick={handleExtract}
              className="px-3 py-1.5 bg-accent/20 hover:bg-accent/40 border border-accent/40 rounded-lg text-special text-accent font-bold transition-colors"
            >
              Extract Preview
            </button>
            {!!extractError && <span className="text-special text-danger">{extractError}</span>}
          </div>
        ) : (
          <span className="text-4xl text-muted">🖼</span>
        )}
      </div>

      {/* Info bar */}
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-special font-bold ${
              photo.extension === 'ARW'
                ? 'bg-[#EA580C]/20 text-[#EA580C] border border-[#EA580C]/30'
                : 'bg-accent/20 text-accent border border-accent/30'
            }`}
          >
            {photo.extension}
          </span>
          {isCompanionJpg && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-special font-bold bg-success/20 text-success border border-success/30">
              +JPEG
            </span>
          )}
          <span className="text-special text-muted truncate">{photo.name}</span>
        </div>
        <div className="text-special text-muted">{formatFileSize(photo.size)}</div>
      </div>

      {/* Metadata accordion */}
      <PhotoMetadataAccordion photo={photo} previewPath={extractedPreviewPath} />
    </div>
  )
}

/** Grid of photo cards for the Photos tab */
function PhotosPanel({ photos }: { photos: PhotoFile[] }): React.ReactElement {
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <PhotoCard key={photo.path} photo={photo} />
        ))}
      </div>
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
  const [selectedDrive, setSelectedDrive] = useState<ExternalDrive | null>(null)
  const [showNetworkSection, setShowNetworkSection] = useState(true)
  const [expandedMetadataFile, setExpandedMetadataFile] = useState<string | null>(null)
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
    try {
      const externalDrives = await window.api.getExternalDrives()
      setDrives(externalDrives)
    } catch (error) {
      console.error('Error loading drives:', error)
    } finally {
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
            <h2 className="text-header font-bold">Browse Media Files</h2>
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
                    <div className="text-body font-bold text-app-white group-hover:text-accent transition-colors">
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
                        <p className="text-body font-bold text-warning">No Sony Card Found</p>
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
                                <div className="font-bold truncate">{drive.name}</div>
                                {drive.cameraModel ? (
                                  <div className="text-special font-bold truncate text-app-white">
                                    {drive.cameraModel}
                                  </div>
                                ) : (
                                  drive.isSonyCard && (
                                    <div className="text-special font-bold text-app-white">
                                      Sony Camera Card
                                    </div>
                                  )
                                )}
                                <div className="text-body text-muted mt-1">
                                  {drive.fileCount} video file{drive.fileCount !== 1 ? 's' : ''}
                                </div>
                                <div className="text-special text-muted">
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
                                <div className="font-bold truncate">{drive.name}</div>
                                <div className="text-special text-[#A855F7] font-bold">
                                  Network Drive
                                </div>
                                <div className="text-body text-muted mt-1">
                                  {drive.fileCount} video file{drive.fileCount !== 1 ? 's' : ''}
                                </div>
                                <div className="text-special text-muted">
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
                    <h3 className="text-subheader mb-1">{selectedDrive.name}</h3>
                    <p className="text-body text-muted">{selectedDrive.path}</p>
                  </div>
                  {activeTab === 'video' &&
                    onMergeRequest &&
                    selectedDrive.mxfFiles.length >= 2 && (
                      <button
                        onClick={() => onMergeRequest(selectedDrive.mxfFiles.map((f) => f.path))}
                        className="px-4 py-2.5 bg-gradient-to-r from-success to-[#0D9488] hover:from-success/80 hover:to-[#0D9488]/80 rounded-lg text-body font-bold transition-all shadow-lg flex items-center gap-2"
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
                    <span className="text-warning text-lg">ℹ</span>
                    <div>
                      <p className="text-body font-bold text-warning">No card index file found</p>
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
                      <span className="text-warning text-lg">⚠</span>
                      <div>
                        <p className="text-body font-bold text-warning">
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
                          onClick={
                            isEmpty ? undefined : () => handleFileClick(file.path, file.metadata)
                          }
                          className={`card flex gap-4 ${isEmpty ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={
                            isEmpty
                              ? 'This file is empty (0 bytes) — the recording was interrupted before any data was saved.'
                              : undefined
                          }
                        >
                          {/* Large Thumbnail */}
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

                          {/* Metadata Section */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="card-value-mono truncate">{file.name}</div>
                              {isEmpty ? (
                                <span
                                  className="px-2 py-0.5 rounded text-special font-bold"
                                  style={{
                                    background: '#450a0a',
                                    color: '#fca5a5',
                                    border: '1px solid #991b1b'
                                  }}
                                >
                                  ⚠ Empty File
                                </span>
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
                                <div className="meta-section-blue">
                                  <div className="text-accent font-bold mb-1 text-special">
                                    XML Metadata
                                  </div>
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
                                </div>

                                {/* Proxy File Section */}
                                {!!file.proxy && (
                                  <div className="meta-section-green">
                                    <div className="text-success font-bold mb-1 text-special">
                                      Proxy File
                                    </div>
                                    <div className="space-y-0.5">
                                      <div className="meta-row">
                                        <span className="card-label">Path:</span>
                                        <span className="card-value truncate">{file.proxy}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Video File Section — label reflects actual format (MP4, MXF, etc.) */}
                                <div className="meta-section-orange">
                                  <div className="text-mxf-orange font-bold mb-1 text-special">
                                    {file.path.split('.').pop()?.toUpperCase() ?? 'Video'} File
                                  </div>
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
                                </div>

                                {/* Button to expand complete XML data */}
                                {!!file.metadata?.rawXML && (
                                  <div className="mt-2">
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setExpandedMetadataFile(
                                          expandedMetadataFile === file.path ? null : file.path
                                        )
                                      }}
                                      className="w-full px-3 py-2 text-special bg-surface-raised hover:bg-surface-border rounded transition-colors flex items-center justify-between cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2">
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
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                          />
                                        </svg>
                                        {expandedMetadataFile === file.path ? 'Hide' : 'View'}{' '}
                                        Complete XML Data
                                      </span>
                                      <svg
                                        className={`w-4 h-4 transition-transform ${expandedMetadataFile === file.path ? 'rotate-180' : ''}`}
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
                                    </div>

                                    {/* Expanded metadata view */}
                                    {expandedMetadataFile === file.path && (
                                      <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                        <MetadataViewer
                                          metadata={file.metadata}
                                          title={`Complete Metadata: ${file.name}`}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Play mode buttons */}
                          <div
                            className="flex flex-col gap-1.5 shrink-0 self-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!!file.proxy &&
                              (() => {
                                const ext = file.path.split('.').pop()?.toUpperCase() ?? 'FILE'
                                const isMxf = ext === 'MXF'
                                return (
                                  <button
                                    onClick={() => handleFileClick(file.path, file.metadata, true)}
                                    className="badge-mxf px-3 py-1.5 hover:bg-mxf-orange/40 transition-colors whitespace-nowrap cursor-pointer"
                                    title={
                                      isMxf
                                        ? 'Stream original MXF via FFmpeg'
                                        : `Play full-resolution ${ext} file`
                                    }
                                  >
                                    ▶ {ext}
                                  </button>
                                )
                              })()}
                          </div>
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
