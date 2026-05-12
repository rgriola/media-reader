/**
 * DriveBrowser — Layout shell coordinating drive sidebar, video file list, and photos panel
 * Updated: May 12, 2026 - 5:52pm
 *
 * Sub-components:
 *   DriveList     — sidebar with drive cards, eject, choose-file
 *   VideoFileList — video file cards with metadata accordions
 *   PhotosPanel   — photo grid with auto-preview queue
 */
import { useState, useEffect, useCallback } from 'react'
import { DriveList } from './drive/DriveList'
import { VideoFileList } from './drive/VideoFileList'
import { PhotosPanel } from './drive/PhotosPanel'
import { RipPanel } from './RipPanel'
import type { ExternalDrive, XMLMetadata } from '../types'

interface DriveBrowserProps {
  onFileSelect: (filepath: string, xmlMetadata?: XMLMetadata, forceOriginal?: boolean) => void
  onClose?: () => void
  onDriveSelect?: (drivePath: string) => void
  initialSelectedDrivePath?: string | null
  onMergeRequest?: (clipPaths: string[]) => void
  refreshSignal?: number
}

export function DriveBrowser({
  onFileSelect,
  onClose,
  onDriveSelect,
  initialSelectedDrivePath,
  onMergeRequest,
  refreshSignal
}: DriveBrowserProps): React.ReactElement {
  const [drives, setDrives] = useState<ExternalDrive[]>([])
  const [loading, setLoading] = useState(true)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [selectedDrive, setSelectedDrive] = useState<ExternalDrive | null>(null)
  const [activeTab, setActiveTab] = useState<'video' | 'photos'>('video')
  const [viewMode, setViewMode] = useState<'card' | 'grid' | 'list'>('card')
  const [showRipPanel, setShowRipPanel] = useState(false)

  // Determine if we're in modal mode (has onClose) or main view mode
  const isModal = !!onClose

  // ─── IPC Subscriptions ────────────────────────────────────

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

  // External refresh trigger from parent header (main view).
  useEffect(() => {
    if (refreshSignal === undefined || refreshSignal === 0) return
    void loadDrives()
  }, [refreshSignal])

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

  // ─── Handlers ─────────────────────────────────────────────

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

  const handleFileClick = useCallback(
    (filepath: string, xmlMetadata?: XMLMetadata, forceOriginal?: boolean): void => {
      onFileSelect(filepath, xmlMetadata, forceOriginal)
      if (onClose) {
        onClose()
      }
    },
    [onFileSelect, onClose]
  )

  const handleChooseFile = useCallback(async (): Promise<void> => {
    const filepath = await window.api.selectFile()
    if (filepath) {
      // forceOriginal=true: play the file the user explicitly chose, not a proxy.
      // App.tsx will route by extension (MP4 → local://, MXF → mxfstream://)
      handleFileClick(filepath, undefined, true)
    }
  }, [handleFileClick])

  const handleSelectDrive = useCallback(
    (drive: ExternalDrive): void => {
      setSelectedDrive(drive)
      if (onDriveSelect) {
        onDriveSelect(drive.path)
      }
    },
    [onDriveSelect]
  )

  // Check if any file on the selected drive has a proxy
  const hasAnyProxy = selectedDrive ? selectedDrive.mxfFiles.some((f) => !!f.proxy) : false

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
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
          {/* Header actions (modal-only) */}
          {isModal && (
            <header className="p-4 border-b border-surface-border flex items-center justify-end gap-2">
              <button
                onClick={loadDrives}
                disabled={loading}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Scanning...' : '🔄 Refresh'}
              </button>
              <button onClick={onClose} className="btn-icon" title="Close browser">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </header>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {/* Drive List Sidebar */}
            <DriveList
              drives={drives}
              loading={loading}
              scanStatus={scanStatus}
              selectedDrive={selectedDrive}
              onSelectDrive={handleSelectDrive}
              onChooseFile={handleChooseFile}
            />

            {/* File List / Photos Panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedDrive ? (
                <>
                  {/* Sticky header — drive name, merge button, tabs, warnings */}
                  <div className="shrink-0 p-4 pb-0 border-b border-surface-border bg-surface/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="panel-title mb-1">{selectedDrive.name}</h3>
                        <p className="item-meta">{selectedDrive.path}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* View mode toggles */}
                        {activeTab === 'video' && (
                          <div className="flex items-center gap-0.5 p-1 bg-surface rounded-lg">
                            <button
                              id="view-card"
                              onClick={() => setViewMode('card')}
                              className={`p-1.5 rounded transition-colors ${viewMode === 'card' ? 'bg-accent text-app-white' : 'text-muted hover:text-app-white'}`}
                              title="Card view"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                              </svg>
                            </button>
                            <button
                              id="view-grid"
                              onClick={() => setViewMode('grid')}
                              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-accent text-app-white' : 'text-muted hover:text-app-white'}`}
                              title="Grid view"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                              </svg>
                            </button>
                            <button
                              id="view-list"
                              onClick={() => setViewMode('list')}
                              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-accent text-app-white' : 'text-muted hover:text-app-white'}`}
                              title="List view"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <line x1="4" y1="6" x2="20" y2="6" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                                <line x1="4" y1="18" x2="20" y2="18" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Merge button */}
                        {activeTab === 'video' &&
                          onMergeRequest &&
                          selectedDrive.mxfFiles.length >= 2 && (
                            <button
                              onClick={() =>
                                onMergeRequest(selectedDrive.mxfFiles.map((f) => f.path))
                              }
                              className="px-4 py-2.5 bg-gradient-to-r from-success to-teal hover:from-success/80 hover:to-teal/80 rounded-lg text-body font-bold transition-all shadow-lg flex items-center gap-2"
                            >
                              <span>🎬</span> Merge All Clips
                            </button>
                          )}

                        {/* Rip MP4 button — only when no proxies exist */}
                        {activeTab === 'video' &&
                          !hasAnyProxy &&
                          selectedDrive.mxfFiles.length > 0 && (
                            <button
                              onClick={() => setShowRipPanel(true)}
                              className="px-4 py-2.5 bg-gradient-to-r from-accent to-purple hover:from-accent/80 hover:to-purple/80 rounded-lg text-body font-bold transition-all shadow-lg flex items-center gap-2"
                            >
                              <span>💾</span> Rip MP4
                            </button>
                          )}
                      </div>
                    </div>

                    {/* Video / Photos tab bar — only on mirrorless cards with photos */}
                    {selectedDrive.photos && selectedDrive.photos.length > 0 && (
                      <div className="flex gap-1 mb-3 p-1 bg-surface rounded-lg w-fit">
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
                      <div className="mb-3 p-3 rounded-lg border border-warning/40 bg-warning/10 flex items-start gap-2">
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
                        <div className="mb-3 p-3 rounded-lg border border-warning/40 bg-warning/10 flex items-start gap-2">
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
                  </div>

                  {/* Scrollable clip / photo content */}
                  <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'photos' &&
                    selectedDrive.photos &&
                    selectedDrive.photos.length > 0 ? (
                      <PhotosPanel photos={selectedDrive.photos} />
                    ) : activeTab === 'video' ? (
                      <VideoFileList
                        files={selectedDrive.mxfFiles}
                        onFileClick={handleFileClick}
                        viewMode={viewMode}
                      />
                    ) : null}
                  </div>
                </>
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
        </div>
      </div>

      {/* Rip Panel modal */}
      {showRipPanel && selectedDrive && (
        <RipPanel files={selectedDrive.mxfFiles} onClose={() => setShowRipPanel(false)} />
      )}
    </>
  )
}
