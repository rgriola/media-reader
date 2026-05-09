import type { PhotoFile } from '../../types'

const RAW_EXTENSIONS = new Set([
  'ARW',
  'CR2',
  'CR3',
  'NEF',
  'NRW',
  'RAF',
  'ORF',
  'RW2',
  'DNG',
  'PEF',
  'SRW'
])

export function isRawPhotoExtension(extension: string): boolean {
  return RAW_EXTENSIONS.has(extension.toUpperCase())
}

export function getPreferredPhotoPreviewPath(
  photo: PhotoFile,
  extractedPreviewPath: string | null
): string | null {
  if (extractedPreviewPath) return extractedPreviewPath
  if (photo.extractedPreview) return photo.extractedPreview
  if (photo.jpgCompanion) return photo.jpgCompanion
  return isRawPhotoExtension(photo.extension) ? null : photo.path
}
