/**
 * DriveList — Sidebar listing local and network drives with eject support
 * Extracted from DriveBrowser.tsx
 * Updated: May 12, 2026 - 4:37pm
 */
import { useState } from 'react'
import { formatFileSize } from '../../utils/formatters'
import type { ExternalDrive } from '../../types'

interface DriveListProps {
  drives: ExternalDrive[]
  loading: boolean
  scanStatus: string | null
  selectedDrive: ExternalDrive | null
  onSelectDrive: (drive: ExternalDrive) => void
  onChooseFile: () => void
}

export function DriveList({
  drives,
  loading,
  scanStatus,
  selectedDrive,
  onSelectDrive,
  onChooseFile
}: DriveListProps): React.ReactElement {
  const [showNetworkSection, setShowNetworkSection] = useState(true)
  // Track which drive is currently being ejected (by path) and any eject error
  const [ejectingDrive, setEjectingDrive] = useState<string | null>(null)
  const [ejectError, setEjectError] = useState<string | null>(null)

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
    <div className="w-1/3 border-r border-surface-border overflow-y-auto">
      {/* Choose File Button — always visible */}
      <div className="p-2 pb-0">
        <div className="mb-3">
          <button
            onClick={onChooseFile}
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

          {/* Local Drives Section */}
          {drives.filter((d) => !d.isNetworkDrive).length > 0 && (
            <div className="mb-4">
              <div className="px-2 py-1 section-label">Local Drives</div>
              {drives
                .filter((d) => !d.isNetworkDrive)
                .map((drive) => (
                  <div key={drive.path} className="relative mb-2">
                    <button
                      onClick={() => onSelectDrive(drive)}
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
                        className={`absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md border shadow-sm transition-colors ${
                          selectedDrive?.path === drive.path
                            ? 'bg-blue-900/75 border-blue-700/80 text-app-white'
                            : 'bg-surface-raised/90 border-surface-border text-muted'
                        } hover:text-app-white hover:bg-danger/80 hover:border-danger/60 disabled:opacity-50 disabled:cursor-not-allowed`}
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
                    className={`w-4 h-4 transition-transform ${showNetworkSection ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
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
                      onClick={() => onSelectDrive(drive)}
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
  )
}
