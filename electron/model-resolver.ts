// Deterministic model-resource resolution. The renderer never gets filesystem
// access; only the main process resolves model paths and only for the bundled
// speech model inside resources/models.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolve the on-disk directory for a bundled speech model.
 * - Development: <project>/resources/models/<name>
 * - Packaged: app.asar.unpacked/resources/models/<name> (real files, so the
 *   WASM runtime and onnxruntime can open them without asar path issues),
 *   falling back to the asar path when unpacking is disabled.
 */
export function resolveModelDir(modelName: string): string {
  if (!app.isPackaged) {
    return join(app.getAppPath(), 'resources', 'models', modelName)
  }
  const unpacked = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'resources',
    'models',
    modelName,
  )
  if (existsSync(unpacked)) return unpacked
  return join(app.getAppPath(), 'resources', 'models', modelName)
}
