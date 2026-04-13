/**
 * Camera Card Configuration
 * Defines folder structures and naming conventions for various camera card formats
 */

export interface CameraCardConfig {
  name: string
  description: string
  type: 'sony' | 'canon' | 'generic'

  // Root level validation
  rootStructure: {
    requiredDirs: string[]
    allowOtherFiles: boolean
  }

  // File paths (relative to volume root)
  paths: {
    clipDir: string // Where MXF/main video files are stored
    proxyDir: string // Where proxy files are stored
    xmlDir: string // Where XML metadata files are stored
    thumbnailDir: string // Where thumbnail files are stored
  }

  // Naming suffixes (appended to base filename)
  suffixes: {
    proxy: string // e.g., "S03"
    xml: string // e.g., "M01"
    thumbnail: string // e.g., "T01"
  }

  // File extensions
  extensions: {
    proxy: string[] // e.g., [".MP4", ".mp4"]
    xml: string[] // e.g., [".XML", ".xml"]
    thumbnail: string[] // e.g., [".JPG", ".jpg"]
  }

  // Display properties
  icon: string
  color: string
}

/**
 * Sony FX6 / Sony Cinema Line Configuration
 * Used by cameras like FX6, FX9, Venice, etc.
 */
export const SonyFX6: CameraCardConfig = {
  name: 'Sony FX6',
  description: 'Sony Cinema Line cameras (FX6, FX9, Venice, etc.)',
  type: 'sony',

  rootStructure: {
    requiredDirs: ['SONY', 'XDROOT'],
    allowOtherFiles: false // ONLY these two directories at root
  },

  paths: {
    clipDir: 'XDROOT/Clip',
    proxyDir: 'XDROOT/Sub',
    xmlDir: 'XDROOT/Clip', // XML files live next to MXF files
    thumbnailDir: 'XDROOT/Thmbnl'
  },

  suffixes: {
    proxy: 'S03',
    xml: 'M01',
    thumbnail: 'T01'
  },

  extensions: {
    proxy: ['.MP4', '.mp4'],
    xml: ['.XML', '.xml'],
    thumbnail: ['.JPG', '.jpg', '.BMP', '.bmp']
  },

  icon: '📹',
  color: 'blue'
}

/**
 * All supported camera configurations
 */
export const CAMERA_CARD_CONFIGS: CameraCardConfig[] = [
  SonyFX6
  // Add more camera configs here in the future
]

/**
 * Detect which camera card type this is based on directory structure
 */
export function detectCameraCardType(directories: string[]): CameraCardConfig | null {
  for (const config of CAMERA_CARD_CONFIGS) {
    // Check if ALL required directories exist
    const hasAllRequired = config.rootStructure.requiredDirs.every((dir) =>
      directories.includes(dir)
    )

    if (!hasAllRequired) {
      continue
    }

    // If allowOtherFiles is false, ensure ONLY required dirs exist (plus hidden files)
    if (!config.rootStructure.allowOtherFiles) {
      const hasOnlyAllowed = directories.every(
        (dir) => config.rootStructure.requiredDirs.includes(dir) || dir.startsWith('.')
      )

      if (hasOnlyAllowed) {
        return config
      }
    } else {
      // Allow other files, just check required dirs exist
      return config
    }
  }

  return null
}

/**
 * Build file path using camera config
 * Returns array of possible paths to check
 */
export function buildFilePath(
  volumePath: string,
  config: CameraCardConfig,
  basename: string,
  type: 'proxy' | 'xml' | 'thumbnail'
): string[] {
  const path = require('path')
  const possiblePaths: string[] = []

  const dir =
    type === 'proxy'
      ? config.paths.proxyDir
      : type === 'xml'
        ? config.paths.xmlDir
        : config.paths.thumbnailDir

  const suffix =
    type === 'proxy'
      ? config.suffixes.proxy
      : type === 'xml'
        ? config.suffixes.xml
        : config.suffixes.thumbnail

  const extensions =
    type === 'proxy'
      ? config.extensions.proxy
      : type === 'xml'
        ? config.extensions.xml
        : config.extensions.thumbnail

  // Build all possible paths with different extension cases
  for (const ext of extensions) {
    possiblePaths.push(path.join(volumePath, dir, `${basename}${suffix}${ext}`))
  }

  return possiblePaths
}
