// Wake-word model resolution. A user-entered phrase cannot become detectable
// merely because its text is stored in config: the sherpa-onnx KWS runtime
// requires a keyword-SPECIFIC trained model (transducer encoder/decoder/joiner
// + tokens) that was trained to spot that exact phrase.
//
// This module is the ENROLLMENT SEAM referenced by the Slice 4A-1/4A-2 audit:
// it maps a normalized phrase to the directory that should contain its keyword
// model.
//
// STATUS after Slice 4A-3: the DEFAULT phrase "Hey NOVA" IS genuinely enrolled —
// the official open-vocabulary English KWS model is bundled at
// resources/models/sherpa-onnx-kws-hey-nova and its BPE token sequence is
// registered (see sherpa-kws.ts ENROLLED_KWS_PHRASES). ARBITRARY user phrases
// remain an enrollment seam: they are only detectable once their BPE token
// sequence is added to ENROLLED_KWS_PHRASES AND a matching compatible model
// directory is installed. Until then the spotter reports the phrase as
// unsupported and never arms against the wrong model.

import { KWS_MODEL_DIR_PREFIX, DEFAULT_KWS_MODEL_NAME } from './constants'
import { slugifyWakePhrase } from './wake-phrase'

/**
 * Name of the keyword-model directory for a normalized phrase.
 * This is the identifier a locally-installed model must use to back the phrase.
 */
export function wakeModelNameForPhrase(phrase: string): string {
  const slug = slugifyWakePhrase(phrase)
  if (!slug) return DEFAULT_KWS_MODEL_NAME
  return `${KWS_MODEL_DIR_PREFIX}${slug}`
}
