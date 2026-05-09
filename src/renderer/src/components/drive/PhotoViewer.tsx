import React, { useCallback, useEffect, useState } from 'react'
import { formatFileSize } from '../../utils/formatters'
import type { PhotoFile } from '../../types'
import { PhotoMetadataAccordion } from './PhotoCard'
import { getPreferredPhotoPreviewPath, isRawPhotoExtension } from './photoUtils'

interface PhotoViewerProps {
  photos: PhotoFile[]
  initialIndex: number
  previewPaths: Record<string, string>
  onPreviewReady: (photoPath: string, previewPath: string) => void
  onClose: () => void
}

export function PhotoViewer({
  photos,
  initialIndex,
  previewPaths,
  onPreviewReady,
  onClose
}: PhotoViewerProps): React.ReactElement | null {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setCurrentIndex(initialIndex)
  }, [initialIndex])

  const totalPhotos = photos.length
  const currentPhoto = photos[currentIndex]

  useEffect(() => {
    setExtracting(false)
    setExtractError(null)
    setImgFailed(false)
  }, [currentPhoto?.path])

  const goPrev = useCallback((): void => {
    if (totalPhotos <= 1) return
    setCurrentIndex((prev) => (prev - 1 + totalPhotos) % totalPhotos)
  }, [totalPhotos])

  const goNext = useCallback((): void => {
    if (totalPhotos <= 1) return
    setCurrentIndex((prev) => (prev + 1) % totalPhotos)
  }, [totalPhotos])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [goNext, goPrev, onClose])

  if (!currentPhoto) return null

  const extractedPreviewPath = previewPaths[currentPhoto.path] ?? null
  const preferredPath = getPreferredPhotoPreviewPath(currentPhoto, extractedPreviewPath)
  const displaySrc = preferredPath ? `local://${preferredPath}` : null
  const isRawPhoto = isRawPhotoExtension(currentPhoto.extension)

  const handleExtract = useCallback(async (): Promise<void> => {
    setExtracting(true)
    setExtractError(null)

    const result = await window.api.extractRawPreview(currentPhoto.path)

    setExtracting(false)
    if (result.success && result.previewPath) {
      onPreviewReady(currentPhoto.path, result.previewPath)
      setImgFailed(false)
      return
    }

    setExtractError(result.error ?? 'Extraction failed')
  }, [currentPhoto.path, onPreviewReady])

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-app-black/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 h-full p-4 lg:p-6">
        <div className="h-full glass rounded-xl p-3 lg:p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="panel-title truncate">{currentPhoto.name}</h3>
              <p className="item-meta">
                {currentIndex + 1} of {totalPhotos}
              </p>
            </div>
            <button
              type="button"
              className="btn-icon p-2"
              onClick={onClose}
              aria-label="Close photo viewer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-3">
            <div className="relative rounded-lg border border-surface-border bg-app-black/80 overflow-hidden flex items-center justify-center">
              {displaySrc && !imgFailed ? (
                <img
                  src={displaySrc}
                  alt={currentPhoto.name}
                  className="max-w-full max-h-full object-contain"
                  onError={() => setImgFailed(true)}
                />
              ) : extracting ? (
                <div className="flex flex-col items-center gap-2 text-muted">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                  <span className="text-special">Extracting RAW preview...</span>
                </div>
              ) : isRawPhoto ? (
                <div className="flex flex-col items-center gap-3">
                  <span className="text-5xl">📷</span>
                  <button type="button" onClick={handleExtract} className="btn-primary">
                    Extract Preview
                  </button>
                  {!!extractError && <p className="text-special text-danger">{extractError}</p>}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted">
                  <span className="text-5xl">🖼</span>
                  <span className="text-special">Preview unavailable</span>
                </div>
              )}

              {totalPhotos > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-app-black/60 hover:bg-app-black/80 border border-surface-border flex items-center justify-center"
                    aria-label="Previous photo"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-app-black/60 hover:bg-app-black/80 border border-surface-border flex items-center justify-center"
                    aria-label="Next photo"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>

            <aside className="panel overflow-y-auto flex flex-col">
              <div className="panel-header">
                <div className="item-title">Photo Details</div>
              </div>

              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-special font-bold ${
                      isRawPhoto
                        ? 'bg-sony-raw/20 text-sony-raw border border-sony-raw/30'
                        : 'bg-accent/20 text-accent border border-accent/30'
                    }`}
                  >
                    {currentPhoto.extension}
                  </span>
                  {!!currentPhoto.jpgCompanion && (
                    <span className="px-2 py-0.5 rounded text-special font-bold bg-success/20 text-success border border-success/30">
                      +JPEG
                    </span>
                  )}
                </div>

                <div className="item-meta">{formatFileSize(currentPhoto.size)}</div>
                <div className="text-special text-muted break-all">{currentPhoto.path}</div>

                {isRawPhoto && !displaySrc && !extracting && (
                  <button type="button" onClick={handleExtract} className="btn-secondary w-full">
                    Extract RAW Preview
                  </button>
                )}

                {!!extractError && <p className="text-special text-danger">{extractError}</p>}
              </div>

              <PhotoMetadataAccordion
                photo={currentPhoto}
                previewPath={extractedPreviewPath}
                showEmptyFieldToggle
              />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
