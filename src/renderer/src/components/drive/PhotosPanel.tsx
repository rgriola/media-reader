/**
 * PhotosPanel — Grid of photo cards for the Photos tab
 * Extracted from DriveBrowser.tsx
 * Updated: May 12, 2026 - 4:37pm
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { PhotoCard } from './PhotoCard'
import { PhotoViewer } from './PhotoViewer'
import { isRawPhotoExtension } from './photoUtils'
import type { PhotoFile } from '../../types'

export function PhotosPanel({ photos }: { photos: PhotoFile[] }): React.ReactElement {
  const [viewerPhotoPath, setViewerPhotoPath] = useState<string | null>(null)
  const [previewPaths, setPreviewPaths] = useState<Record<string, string>>({})
  const [autoPreviewsRemaining, setAutoPreviewsRemaining] = useState(0)
  const previewPathsRef = useRef<Record<string, string>>({})

  const persistedPreviews = useMemo(
    () =>
      photos.reduce<Record<string, string>>((acc, photo) => {
        if (photo.extractedPreview) {
          acc[photo.path] = photo.extractedPreview
        }
        return acc
      }, {}),
    [photos]
  )

  const effectivePreviewPaths = useMemo(
    () => ({ ...persistedPreviews, ...previewPaths }),
    [persistedPreviews, previewPaths]
  )

  const viewerIndex = viewerPhotoPath
    ? photos.findIndex((photo) => photo.path === viewerPhotoPath)
    : -1

  useEffect(() => {
    previewPathsRef.current = effectivePreviewPaths
  }, [effectivePreviewPaths])

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

    const runAutoPreviewQueue = async (): Promise<void> => {
      // Yield once so state updates happen asynchronously rather than directly in effect body.
      await Promise.resolve()
      if (cancelled) return

      let remaining = rawWithoutJpeg.filter((photo) => !previewPathsRef.current[photo.path]).length
      setAutoPreviewsRemaining(remaining)

      if (remaining === 0) {
        return
      }

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
        {photos.map((photo) => (
          <PhotoCard
            key={photo.path}
            photo={photo}
            externalPreviewPath={effectivePreviewPaths[photo.path] ?? null}
            onPreviewReady={handlePreviewReady}
            onOpenViewer={() => setViewerPhotoPath(photo.path)}
          />
        ))}
      </div>

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          previewPaths={previewPaths}
          onPreviewReady={handlePreviewReady}
          onClose={() => setViewerPhotoPath(null)}
        />
      )}
    </div>
  )
}
