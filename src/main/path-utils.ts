/**
 * File path validation utilities for the main process.
 * Extracted from ipc.ts for testability and reuse.
 */
import { resolve as pathResolve } from 'path'
import { app } from 'electron'

/**
 * Validate that a file path is absolute and within allowed directories.
 * Allowed: /Volumes/* and the user's home directory tree.
 * Throws if the path is outside these boundaries.
 */
export function validateFilePath(filepath: string): string {
  const resolved = pathResolve(filepath)
  const allowedRoots = ['/Volumes', app.getPath('home')]
  const allowed = allowedRoots.some((root) => resolved.startsWith(root + '/') || resolved === root)
  if (!allowed) {
    throw new Error(`Access denied: path outside allowed directories`)
  }
  return resolved
}
