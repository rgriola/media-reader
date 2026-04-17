import { useState, useEffect } from 'react'
import { formatFileSize, formatFramesDuration } from '../utils/formatters'
import { MetadataViewer } from './MetadataViewer'
import type { ExternalDrive, XMLMetadata } from '../types'

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
      handleFileClick(filepath)
    }
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
                  <p className="text-special text-muted mt-2">Insert an SD card or external drive</p>
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

                {/* Choose File Button */}
                <div className="mb-4">
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

                {/* Local Drives Section */}
                {drives.filter((d) => !d.isNetworkDrive).length > 0 && (
                  <div className="mb-4">
                    <div className="px-2 py-1 section-label">Local Drives</div>
                    {drives
                      .filter((d) => !d.isNetworkDrive)
                      .map((drive) => (
                        <button
                          key={drive.path}
                          onClick={() => {
                            setSelectedDrive(drive)
                            if (onDriveSelect) {
                              onDriveSelect(drive.path)
                            }
                          }}
                          className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${
                            selectedDrive?.path === drive.path
                              ? 'bg-accent'
                              : 'hover:bg-surface-raised'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-3xl">{drive.isSonyCard ? '📹' : '💾'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold truncate">{drive.name}</div>
                              {drive.cameraModel ? (
                                <div className="text-special text-accent font-bold truncate">
                                  {drive.cameraModel}
                                </div>
                              ) : (
                                drive.isSonyCard && (
                                  <div className="text-special text-accent font-bold">
                                    Sony Camera Card
                                  </div>
                                )
                              )}
                              <div className="text-body text-muted mt-1">
                                {drive.fileCount} MXF file{drive.fileCount !== 1 ? 's' : ''}
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
                      ))}
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
                                ? 'bg-accent'
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
                                  {drive.fileCount} MXF file{drive.fileCount !== 1 ? 's' : ''}
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
                  {onMergeRequest && selectedDrive.mxfFiles.length >= 2 && (
                    <button
                      onClick={() => onMergeRequest(selectedDrive.mxfFiles.map((f) => f.path))}
                      className="px-4 py-2.5 bg-gradient-to-r from-success to-[#0D9488] hover:from-success/80 hover:to-[#0D9488]/80 rounded-lg text-body font-bold transition-all shadow-lg flex items-center gap-2"
                    >
                      <span>🎬</span> Merge All Clips
                    </button>
                  )}
                </div>

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

                {selectedDrive.mxfFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted">No MXF files found on this drive</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDrive.mxfFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => handleFileClick(file.path, file.metadata)}
                        className="card flex gap-4"
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
                            {file.proxy ? (
                              <span className="badge-success">PROXY</span>
                            ) : (
                              <span className="badge-muted">NO PROXY</span>
                            )}
                          </div>
                          <div className="text-special text-muted truncate">{file.path}</div>

                          {/* Quick stats from MEDIAPRO — available before sidecar XML loads */}
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
                                <div className="text-accent font-bold mb-1 text-special">XML Metadata</div>
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
                                      <span className="card-value">{file.metadata.frameRate}</span>
                                    </div>
                                  )}
                                  {file.metadata.resolution && (
                                    <div className="meta-row">
                                      <span className="card-label">Resolution:</span>
                                      <span className="card-value">{file.metadata.resolution}</span>
                                    </div>
                                  )}
                                  {file.metadata.videoCodec && (
                                    <div className="meta-row">
                                      <span className="card-label">Codec:</span>
                                      <span className="card-value">{file.metadata.videoCodec}</span>
                                    </div>
                                  )}
                                  {file.metadata.aspectRatio && (
                                    <div className="meta-row">
                                      <span className="card-label">Aspect Ratio:</span>
                                      <span className="card-value">{file.metadata.aspectRatio}</span>
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

                              {/* MXF File Section */}
                              <div className="meta-section-orange">
                                <div className="text-mxf-orange font-bold mb-1 text-special">MXF File</div>
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
                          {!!file.proxy && (
                            <button
                              onClick={() => handleFileClick(file.path, file.metadata, true)}
                              className="badge-mxf px-3 py-1.5 hover:bg-mxf-orange/40 transition-colors whitespace-nowrap cursor-pointer"
                              title="Stream original MXF via FFmpeg"
                            >
                              ▶ MXF
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
