/**
 * IMINT dossier generation is paused until a local image is tied to a source
 * product and every annotation has its own evidence record. A STAC scene search
 * alone cannot validate a JPEG already present in this repository.
 */
async function generateImintSlide() {
  return { success: false, path: null, reason: 'LOCAL_IMAGE_PROVENANCE_UNVERIFIED' };
}

async function generateAllImintSlides() {
  return { success: false, paths: [], reason: 'LOCAL_IMAGE_PROVENANCE_UNVERIFIED' };
}

module.exports = { generateImintSlide, generateAllImintSlides };
