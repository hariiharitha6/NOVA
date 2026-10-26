// Remove the local speech benchmark corpus and any measured results.
//
// The corpus (benchmark/speech/) contains recordings you made yourself. It is
// gitignored and never uploaded, but you can delete every trace at any time:
//
//   npm run speech:corpus:remove
//
// Nothing else in the repository references these files.

import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const corpusDir = join(repoRoot, 'benchmark', 'speech')

if (!existsSync(corpusDir)) {
  console.log(`Nothing to remove — ${corpusDir} does not exist.`)
  process.exit(0)
}

rmSync(corpusDir, { recursive: true, force: true })
console.log(`Removed local speech corpus and results: ${corpusDir}`)
