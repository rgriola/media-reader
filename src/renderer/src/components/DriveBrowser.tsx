import { useState, useEffect } from 'react'
import { formatFileSize } from '../utils/formatters'
import { MetadataViewer } from './MetadataViewer'
import type { ExternalDrive } from '../types'

interface DriveBrowserProps {
  onFileSelect: (filepath: string) => void
  onClose?: () => void
  onDriveSelect?: (drivePath: string) => void
  initialSelectedDrivePath?: string | null
  onMergeRequest?: (clipPaths: string[]) => void
}

function FileThumbnail({ thumbnail, name, children }: { thumbnail?: string; name: string; children: React.ReactNode }) {
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="flex-shrink-0">
      {thumbnail && !imgFailed ? (
        <img
          src={`local://${thumbnail}`}
          alt={name}
          className="w-60 h-[135px] object-cover rounded bg-gray-900"
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
}: DriveBrowserProps) {
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
  }, [])

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

  const loadDrives = async () => {
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

  const handleFileClick = (filepath: string) => {
    onFileSelect(filepath)
    if (onClose) {
      onClose() // Close the browser to show the player (modal mode)
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
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold">Browse Media Files</h2>
            <p className="text-sm text-gray-400 mt-1">
              {drives.length === 0
                ? 'No external drives detected'
                : `${drives.length} drive(s) connected`}
            </p>
          </div>
          {isModal && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
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
          <div className="w-1/3 border-r border-gray-700 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-400">Scanning drives...</p>
                </div>
              </div>
            ) : drives.length === 0 ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 text-gray-600 mx-auto mb-4"
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
                  <p className="text-gray-400">No external drives found</p>
                  <p className="text-sm text-gray-500 mt-2">Insert an SD card or external drive</p>
                </div>
              </div>
            ) : (
              <div className="p-2">
                {/* Sony Card Notice */}
                {drives.length > 0 && !drives.some((d) => d.isSonyCard) && (
                  <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5"
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
                        <p className="text-sm font-semibold text-yellow-200">No Sony Card Found</p>
                        <p className="text-xs text-yellow-300/80 mt-1">
                          If a card is connected check the computer sees it.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Local Drives Section */}
                {drives.filter((d) => !d.isNetworkDrive).length > 0 && (
                  <div className="mb-4">
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Local Drives
                    </div>
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
                          className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${selectedDrive?.path === drive.path ? 'bg-blue-600' : 'hover:bg-gray-800'
                            }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-3xl">{drive.isSonyCard ? '📹' : '💾'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{drive.name}</div>
                              {drive.isSonyCard && (
                                <div className="text-xs text-blue-300 font-medium">
                                  Sony Camera Card
                                </div>
                              )}
                              <div className="text-sm text-gray-400 mt-1">
                                {drive.fileCount} MXF file{drive.fileCount !== 1 ? 's' : ''}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatFileSize(drive.totalSize)}
                              </div>
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
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Network Drives
                      </div>
                      <button
                        onClick={() => setShowNetworkSection(!showNetworkSection)}
                        className="p-1 hover:bg-gray-800 rounded transition-colors"
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
                            className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${selectedDrive?.path === drive.path
                                ? 'bg-blue-600'
                                : 'hover:bg-gray-800'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="text-3xl">🌐</div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{drive.name}</div>
                                <div className="text-xs text-purple-300 font-medium">
                                  Network Drive
                                </div>
                                <div className="text-sm text-gray-400 mt-1">
                                  {drive.fileCount} MXF file{drive.fileCount !== 1 ? 's' : ''}
                                </div>
                                <div className="text-xs text-gray-500">
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
                    <h3 className="font-semibold text-lg mb-1">{selectedDrive.name}</h3>
                    <p className="text-sm text-gray-400">{selectedDrive.path}</p>
                  </div>
                  {onMergeRequest && selectedDrive.mxfFiles.length >= 2 && (
                    <button
                      onClick={() => onMergeRequest(selectedDrive.mxfFiles.map(f => f.path))}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg text-sm font-semibold transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2"
                    >
                      <span>🎬</span> Merge All Clips
                    </button>
                  )}
                </div>

                {selectedDrive.mxfFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400">No MXF files found on this drive</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDrive.mxfFiles.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => handleFileClick(file.path)}
                        className="w-full text-left p-4 rounded-lg hover:bg-gray-800 transition-colors border border-gray-700 hover:border-gray-600 flex gap-4"
                      >
                        {/* Large Thumbnail */}
                        <FileThumbnail thumbnail={file.thumbnail} name={file.name}>
                          <div
                            className="w-60 h-[135px] flex items-center justify-center bg-gray-900 rounded"
                          >
                            <svg
                              className="w-20 h-20 text-blue-400"
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
                            <div className="font-mono text-sm truncate">{file.name}</div>
                            {file.proxy ? (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-green-500/20 text-green-400 rounded border border-green-500/30">
                                PROXY
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500/20 text-gray-400 rounded border border-gray-500/30">
                                NO PROXY
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{file.path}</div>

                          {/* Metadata Display - Organized by Source */}
                          {file.metadata && (
                            <div className="mt-2 space-y-2 text-xs">
                              {/* XML Metadata Section */}
                              <div className="border-l-2 border-blue-500/30 pl-2">
                                <div className="text-blue-400 font-semibold mb-1">XML Metadata</div>
                                <div className="space-y-0.5 text-gray-400">
                                  {file.metadata.startTimecode && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Start TC:</span>
                                      <span className="font-mono text-blue-300">
                                        {file.metadata.startTimecode}
                                      </span>
                                      {file.metadata.dropFrame && (
                                        <span className="text-yellow-400 text-xs">(DF)</span>
                                      )}
                                    </div>
                                  )}
                                  {file.metadata.duration && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Duration:</span>
                                      <span className="font-mono text-blue-300">
                                        {file.metadata.duration}
                                      </span>
                                    </div>
                                  )}
                                  {file.metadata.frameRate && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Frame Rate:</span>
                                      <span className="text-purple-300">
                                        {file.metadata.frameRate}
                                      </span>
                                    </div>
                                  )}
                                  {file.metadata.resolution && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Resolution:</span>
                                      <span className="text-green-300">
                                        {file.metadata.resolution}
                                      </span>
                                    </div>
                                  )}
                                  {file.metadata.videoCodec && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Codec:</span>
                                      <span className="text-gray-300">
                                        {file.metadata.videoCodec}
                                      </span>
                                    </div>
                                  )}
                                  {file.metadata.aspectRatio && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Aspect Ratio:</span>
                                      <span className="text-gray-300">
                                        {file.metadata.aspectRatio}
                                      </span>
                                    </div>
                                  )}
                                  {file.metadata.creationDate && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Created:</span>
                                      <span className="text-gray-300">
                                        {new Date(file.metadata.creationDate).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Proxy File Section */}
                              {file.proxy && (
                                <div className="border-l-2 border-green-500/30 pl-2">
                                  <div className="text-green-400 font-semibold mb-1">
                                    Proxy File
                                  </div>
                                  <div className="space-y-0.5 text-gray-400">
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Path:</span>
                                      <span className="text-gray-300 truncate">{file.proxy}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* MXF File Section */}
                              <div className="border-l-2 border-orange-500/30 pl-2">
                                <div className="text-orange-400 font-semibold mb-1">MXF File</div>
                                <div className="space-y-0.5 text-gray-400">
                                  <div className="flex gap-2">
                                    <span className="text-gray-500 w-24">Filename:</span>
                                    <span className="text-gray-300 font-mono">{file.name}</span>
                                  </div>
                                  {file.thumbnail && (
                                    <div className="flex gap-2">
                                      <span className="text-gray-500 w-24">Thumbnail:</span>
                                      <span className="text-gray-300">Available</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Button to expand complete XML data */}
                              {file.metadata?.rawXML && (
                                <div className="mt-2">
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setExpandedMetadataFile(
                                        expandedMetadataFile === file.path ? null : file.path
                                      )
                                    }}
                                    className="w-full px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors flex items-center justify-between cursor-pointer"
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
                        <svg
                          className="w-5 h-5 text-gray-500"
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
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-600"
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
        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
          <button
            onClick={loadDrives}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {loading ? 'Scanning...' : '🔄 Refresh'}
          </button>
          {isModal && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
