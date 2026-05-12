import React, { useState, useCallback, useRef, useEffect } from 'react'
import { formatFileSize } from '../../utils/formatters'
import type { PhotoFile, PhotoMetadata } from '../../types'
import { getPreferredPhotoPreviewPath, isRawPhotoExtension } from './photoUtils'

// ─── FileThumbnail ─────────────────────────────────────────────

export function FileThumbnail({
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

// ─── MetaRow ───────────────────────────────────────────────────

/** Formats a metadata row label+value pair */
export function MetaRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-2 py-0.5 border-b border-surface-border/40 last:border-0">
      <span className="text-special text-muted shrink-0">{label}</span>
      <span className="text-special text-app-white/90 text-right truncate">{value}</span>
    </div>
  )
}

// ─── PhotoMetadataAccordion ────────────────────────────────────

/** Groups of metadata to display in the accordion */
export function PhotoMetadataAccordion({
  photo,
  previewPath,
  showEmptyFieldToggle = false
}: {
  photo: PhotoFile
  previewPath: string | null
  showEmptyFieldToggle?: boolean
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [showEmptyFields, setShowEmptyFields] = useState(false)
  const [meta, setMeta] = useState<PhotoMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)

  const metaRef = useRef<PhotoMetadata | null>(null)
  const loadingRef = useRef(false)

  const loading = open && !meta && !error

  const handleToggle = useCallback((): void => {
    setOpen((prev) => !prev)
  }, [])

  const formatFieldValue = useCallback((value: string | number | undefined): string => {
    if (value === undefined || value === null || value === '') return 'N/A'
    return String(value)
  }, [])

  const showGroup = useCallback(
    (values: Array<string | number | undefined>): boolean => {
      if (showEmptyFields) return true
      return values.some((value) => value !== undefined && value !== null && value !== '')
    },
    [showEmptyFields]
  )

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
      <button
        id={`photo-meta-toggle-${photo.name}`}
        onClick={handleToggle}
        className="accordion-header px-3 py-2 border-t border-surface-border/60"
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
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

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
              {showEmptyFieldToggle && (
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={() => setShowEmptyFields((prev) => !prev)}
                    className="px-2 py-0.5 rounded text-special bg-surface-raised hover:bg-surface-border text-muted hover:text-app-white transition-colors"
                  >
                    {showEmptyFields ? 'Hide Empty Fields' : 'Show Empty Fields'}
                  </button>
                </div>
              )}

              {showGroup([meta.title, meta.caption]) && (
                <div className="mb-2">
                  <div className="meta-group-label">Content</div>
                  <MetaRow label="Title" value={formatFieldValue(meta.title)} />
                  <MetaRow label="Caption" value={formatFieldValue(meta.caption)} />
                </div>
              )}

              {showGroup([meta.make, meta.model, meta.lens]) && (
                <div className="mb-2">
                  <div className="meta-group-label">Camera</div>
                  <MetaRow label="Make" value={formatFieldValue(meta.make)} />
                  <MetaRow label="Model" value={formatFieldValue(meta.model)} />
                  <MetaRow label="Lens" value={formatFieldValue(meta.lens)} />
                </div>
              )}

              {showGroup([
                meta.exposureTime,
                meta.fNumber,
                meta.iso,
                meta.focalLength,
                meta.focalLengthIn35mm,
                meta.exposureMode,
                meta.meteringMode,
                meta.whiteBalance,
                meta.whiteBalanceKelvin
              ]) && (
                <div className="mb-2">
                  <div className="meta-group-label">Exposure</div>
                  <MetaRow label="Shutter" value={formatFieldValue(meta.exposureTime)} />
                  <MetaRow label="Aperture" value={formatFieldValue(meta.fNumber)} />
                  <MetaRow label="ISO" value={formatFieldValue(meta.iso)} />
                  <MetaRow label="Focal Length" value={formatFieldValue(meta.focalLength)} />
                  <MetaRow label="35mm Equiv." value={formatFieldValue(meta.focalLengthIn35mm)} />
                  <MetaRow label="Exp. Mode" value={formatFieldValue(meta.exposureMode)} />
                  <MetaRow label="Metering" value={formatFieldValue(meta.meteringMode)} />
                  <MetaRow label="White Balance" value={formatFieldValue(meta.whiteBalance)} />
                  <MetaRow
                    label="White Balance (K)"
                    value={formatFieldValue(meta.whiteBalanceKelvin)}
                  />
                </div>
              )}

              {showGroup([meta.width, meta.height, meta.colorSpace]) && (
                <div className="mb-2">
                  <div className="meta-group-label">Image</div>
                  <MetaRow
                    label="Resolution"
                    value={
                      meta.width !== undefined && meta.height !== undefined
                        ? `${meta.width} × ${meta.height}`
                        : 'N/A'
                    }
                  />
                  <MetaRow label="Color Space" value={formatFieldValue(meta.colorSpace)} />
                </div>
              )}

              {showGroup([meta.dateTimeOriginal]) && (
                <div className="mb-2">
                  <div className="meta-group-label">Date</div>
                  <MetaRow label="Captured" value={formatFieldValue(meta.dateTimeOriginal)} />
                </div>
              )}

              {showGroup([meta.gpsLatitude, meta.gpsLongitude]) && (
                <div>
                  <div className="meta-group-label">Location</div>
                  <MetaRow label="Lat" value={formatFieldValue(meta.gpsLatitude)} />
                  <MetaRow label="Lon" value={formatFieldValue(meta.gpsLongitude)} />
                </div>
              )}

              {Object.keys(meta).length === 0 && !showEmptyFields && (
                <p className="text-special text-muted py-1">No EXIF data found in this file.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── PhotoCard ─────────────────────────────────────────────────

/**
 * Individual photo card inside the Photos panel.
 * - If the photo has a JPG companion (RAW+JPEG mode) → show it directly
 * - If it's a standalone JPG → show it directly
 * - If it's RAW-only → show an "Extract Preview" button that calls FFmpeg
 */
interface PhotoCardProps {
  photo: PhotoFile
  externalPreviewPath?: string | null
  onPreviewReady?: (photoPath: string, previewPath: string) => void
  onOpenViewer?: () => void
}

export function PhotoCard({
  photo,
  externalPreviewPath = null,
  onPreviewReady,
  onOpenViewer
}: PhotoCardProps): React.ReactElement {
  const [imgSrc, setImgSrc] = useState<string | null>(
    getPreferredPhotoPreviewPath(photo, externalPreviewPath)
  )
  const [imgFailed, setImgFailed] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedPreviewPath, setExtractedPreviewPath] = useState<string | null>(null)

  const isRawPhoto = isRawPhotoExtension(photo.extension)

  useEffect(() => {
    const preferredPath = getPreferredPhotoPreviewPath(photo, externalPreviewPath)
    setImgSrc(preferredPath)
    if (externalPreviewPath) {
      setExtractedPreviewPath(externalPreviewPath)
      setImgFailed(false)
    }
  }, [externalPreviewPath, photo.extension, photo.jpgCompanion, photo.path])

  const handleExtract = useCallback(async (): Promise<void> => {
    setExtracting(true)
    setExtractError(null)
    const result = await window.api.extractRawPreview(photo.path)
    setExtracting(false)
    if (result.success && result.previewPath) {
      setImgSrc(result.previewPath)
      setExtractedPreviewPath(result.previewPath)
      setImgFailed(false)
      onPreviewReady?.(photo.path, result.previewPath)
    } else {
      setExtractError(result.error ?? 'Extraction failed')
    }
  }, [onPreviewReady, photo.path])

  const displaySrc = imgSrc ? `local://${imgSrc}` : null
  const isCompanionJpg = !!photo.jpgCompanion

  return (
    <div className="bg-surface rounded-xl overflow-hidden border border-surface-border hover:border-accent/50 transition-all group flex flex-col">
      <div className="relative w-full aspect-[3/2] bg-surface-raised flex items-center justify-center overflow-hidden">
        {displaySrc && !imgFailed ? (
          <img
            src={displaySrc}
            alt={photo.name}
            className={`w-full h-full object-cover ${onOpenViewer ? 'cursor-zoom-in' : ''}`}
            onClick={onOpenViewer}
            onError={() => setImgFailed(true)}
          />
        ) : extracting ? (
          <div className="flex flex-col items-center gap-2 text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            <span className="text-special">Extracting…</span>
          </div>
        ) : isRawPhoto && !imgSrc ? (
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">📷</span>
            <button
              type="button"
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

      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-special font-bold ${
              isRawPhoto
                ? 'bg-sony-raw/20 text-sony-raw border border-sony-raw/30'
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

      <PhotoMetadataAccordion
        photo={photo}
        previewPath={extractedPreviewPath}
        showEmptyFieldToggle
      />
    </div>
  )
}
