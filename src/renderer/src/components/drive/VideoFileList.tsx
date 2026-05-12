/**
 * VideoFileList — Video file display with Card, Grid, and List view modes
 * Extracted from DriveBrowser.tsx
 * Updated: May 12, 2026 - 5:32pm
 */
import { formatFramesDuration } from '../../utils/formatters'
import { MetadataViewer } from '../MetadataViewer'
import { Accordion } from '../metadata/Accordion'
import { FileThumbnail } from './PhotoCard'
import type { VideoFileInfo, XMLMetadata } from '../../types'

interface VideoFileListProps {
  files: VideoFileInfo[]
  onFileClick: (filepath: string, xml?: XMLMetadata, forceOriginal?: boolean) => void
  viewMode: 'card' | 'grid' | 'list'
}

// ─── Shared helpers ─────────────────────────────────────────

function ProxyBadge({ file }: { file: VideoFileInfo }): React.ReactElement {
  const isEmpty = file.size === 0
  if (isEmpty) return <span className="badge-danger-deep">⚠ Empty</span>
  if (file.proxy) return <span className="badge-success">PROXY</span>
  return <span className="badge-muted">NO PROXY</span>
}

function FormatBadge({ file }: { file: VideoFileInfo }): React.ReactElement {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? ''
  switch (ext) {
    case 'MXF':
      return <span className="badge-mxf">{ext}</span>
    case 'MP4':
    case 'M4V':
      return <span className="badge-mp4">{ext}</span>
    case 'MOV':
      return <span className="badge-accent">{ext}</span>
    default:
      return <span className="badge-muted">{ext || 'VIDEO'}</span>
  }
}

function PlayOverlay({ isEmpty }: { isEmpty: boolean }): React.ReactElement | null {
  if (isEmpty) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-app-black/25 group-hover:bg-app-black/40 transition-colors">
      <div className="w-10 h-10 rounded-full bg-app-black/70 border border-app-white/30 flex items-center justify-center shadow-lg">
        <svg
          className="w-4 h-4 text-app-white ml-0.5"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  )
}

function ThumbnailFallback(): React.ReactElement {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded">
      <svg
        className="w-12 h-12 text-accent"
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
  )
}

function PlayButton({
  file,
  onFileClick,
  className,
  children
}: {
  file: VideoFileInfo
  onFileClick: (filepath: string, xml?: XMLMetadata) => void
  className?: string
  children: React.ReactNode
}): React.ReactElement {
  const isEmpty = file.size === 0
  return (
    <button
      type="button"
      onClick={() => onFileClick(file.path, file.metadata)}
      disabled={isEmpty}
      aria-label={isEmpty ? `${file.name} is empty` : `Play ${file.name}`}
      title={isEmpty ? undefined : `Play ${file.name}`}
      className={`relative rounded overflow-hidden transition-shadow ${
        isEmpty
          ? 'cursor-not-allowed'
          : 'group cursor-pointer hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

// ─── Card View (full metadata, original layout) ────────────

function CardView({
  files,
  onFileClick
}: {
  files: VideoFileInfo[]
  onFileClick: VideoFileListProps['onFileClick']
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {files.map((file) => {
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
                <FormatBadge file={file} />
                <ProxyBadge file={file} />
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
                  <Accordion title="XML Metadata" defaultOpen accent="blue">
                    <div className="space-y-0.5">
                      {file.metadata.startTimecode && (
                        <div className="meta-row">
                          <span className="card-label">Start TC:</span>
                          <span className="card-value-accent">{file.metadata.startTimecode}</span>
                          {file.metadata.dropFrame && (
                            <span className="badge-warning text-special">(DF)</span>
                          )}
                        </div>
                      )}
                      {file.metadata.duration && (
                        <div className="meta-row">
                          <span className="card-label">Duration:</span>
                          <span className="card-value-accent">{file.metadata.duration}</span>
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
                  </Accordion>

                  {!!file.proxy && (
                    <Accordion title="Proxy File" defaultOpen accent="green">
                      <div className="meta-row">
                        <span className="card-label">Path:</span>
                        <span className="card-value truncate">{file.proxy}</span>
                      </div>
                    </Accordion>
                  )}

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

                  {!!file.metadata?.rawXML && (
                    <Accordion title="Complete XML Data" accent="muted">
                      <MetadataViewer metadata={file.metadata} />
                    </Accordion>
                  )}
                </div>
              )}
            </div>

            {/* Thumbnail play target */}
            <PlayButton file={file} onFileClick={onFileClick} className="shrink-0">
              <FileThumbnail thumbnail={file.thumbnail} name={file.name}>
                <div className="w-60 h-[135px]">
                  <ThumbnailFallback />
                </div>
              </FileThumbnail>
              <PlayOverlay isEmpty={isEmpty} />
            </PlayButton>
          </div>
        )
      })}
    </div>
  )
}

// ─── Grid View (compact thumbnail grid) ─────────────────────

function GridView({
  files,
  onFileClick
}: {
  files: VideoFileInfo[]
  onFileClick: VideoFileListProps['onFileClick']
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {files.map((file) => {
        const isEmpty = file.size === 0
        return (
          <PlayButton
            key={file.path}
            file={file}
            onFileClick={onFileClick}
            className={`flex flex-col ${isEmpty ? 'opacity-50' : ''}`}
          >
            {/* Thumbnail */}
            <div className="aspect-video w-full">
              <FileThumbnail thumbnail={file.thumbnail} name={file.name}>
                <ThumbnailFallback />
              </FileThumbnail>
              <PlayOverlay isEmpty={isEmpty} />
            </div>

            {/* Info bar */}
            <div className="p-2 bg-surface rounded-b-lg text-left w-full">
              <div className="text-special font-bold text-app-white truncate">{file.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <FormatBadge file={file} />
                <ProxyBadge file={file} />
                {!!file.durationFrames && !!file.fps && (
                  <span className="text-special text-muted">
                    {formatFramesDuration(file.durationFrames, file.fps)}
                  </span>
                )}
              </div>
              {file.metadata?.startTimecode && (
                <div className="text-special text-accent mt-0.5 font-mono">
                  {file.metadata.startTimecode}
                </div>
              )}
            </div>
          </PlayButton>
        )
      })}
    </div>
  )
}

// ─── List View (compact rows, tabular) ──────────────────────

function ListView({
  files,
  onFileClick
}: {
  files: VideoFileInfo[]
  onFileClick: VideoFileListProps['onFileClick']
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-surface-border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[60px_1fr_100px_100px_80px_70px_80px] gap-2 px-3 py-2 bg-surface-raised/50 border-b border-surface-border text-special font-bold text-muted uppercase tracking-wider">
        <span>Type</span>
        <span>Filename</span>
        <span>Timecode</span>
        <span>Duration</span>
        <span>Codec</span>
        <span>Audio</span>
        <span>Proxy</span>
      </div>

      {/* Rows */}
      {files.map((file) => {
        const isEmpty = file.size === 0
        return (
          <button
            key={file.path}
            type="button"
            onClick={() => onFileClick(file.path, file.metadata)}
            disabled={isEmpty}
            className={`w-full grid grid-cols-[60px_1fr_100px_100px_80px_70px_80px] gap-2 px-3 py-2.5 text-left border-b border-surface-border/50 last:border-b-0 transition-colors ${
              isEmpty
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-surface-raised/60 cursor-pointer'
            }`}
          >
            {/* Format badge */}
            <div className="self-center">
              <FormatBadge file={file} />
            </div>
            {/* Filename + thumbnail hint */}
            <div className="flex items-center gap-2 min-w-0">
              {file.thumbnail && (
                <div className="w-10 h-6 rounded overflow-hidden shrink-0">
                  <FileThumbnail thumbnail={file.thumbnail} name={file.name}>
                    <div className="w-full h-full bg-surface" />
                  </FileThumbnail>
                </div>
              )}
              <span className="text-body font-mono text-app-white truncate">{file.name}</span>
            </div>

            {/* Timecode */}
            <span className="text-body font-mono text-accent self-center">
              {file.metadata?.startTimecode ?? '—'}
            </span>

            {/* Duration */}
            <span className="text-body text-muted self-center">
              {file.durationFrames && file.fps
                ? formatFramesDuration(file.durationFrames, file.fps)
                : file.metadata?.duration ?? '—'}
            </span>

            {/* Codec */}
            <span className="text-body text-muted self-center truncate">
              {file.metadata?.videoCodec ?? '—'}
            </span>

            {/* Audio */}
            <span className="text-body text-muted self-center">
              {file.audioChannels ? `${file.audioChannels}ch` : '—'}
            </span>

            {/* Proxy badge */}
            <div className="self-center">
              <ProxyBadge file={file} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function VideoFileList({
  files,
  onFileClick,
  viewMode
}: VideoFileListProps): React.ReactElement {
  if (files.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">No video files found on this drive</p>
      </div>
    )
  }

  switch (viewMode) {
    case 'grid':
      return <GridView files={files} onFileClick={onFileClick} />
    case 'list':
      return <ListView files={files} onFileClick={onFileClick} />
    case 'card':
    default:
      return <CardView files={files} onFileClick={onFileClick} />
  }
}
