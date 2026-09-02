/**
 * Turning a photo off somebody's phone into something small enough to keep on
 * their profile.
 *
 * There is no file storage in this app — it isn't on the free Firebase plan —
 * so a profile picture has to live inside the profile document itself, as a
 * data URL. That is only reasonable if it is genuinely small, which is what
 * everything here is for: crop it square, shrink it to a thumbnail, and encode
 * it down until it fits. A phone photo arrives at three or four megabytes; what
 * comes out of here is a few tens of kilobytes.
 *
 * The square crop is not a shortcut either. Every face in the app is drawn in a
 * circle, so a photo that kept its shape would be cropped anyway — better to do
 * it once, here, than to store the parts nobody will ever see.
 */

/** The stored edge length, in pixels. Retina-sharp at the size cards draw it. */
const PHOTO_SIZE = 256

/**
 * The ceiling on a stored photo, in characters of data URL.
 *
 * A Firestore document may be a megabyte all in, and the profile carries a name
 * and a PIN hash beside this, so this is set far below the limit rather than
 * near it: a photo is not worth being the reason a profile stops saving.
 */
export const MAX_PHOTO_CHARS = 120_000

/** Quality settings tried in order until one comes in under the ceiling. */
const ATTEMPTS: { size: number; quality: number }[] = [
  { size: PHOTO_SIZE, quality: 0.72 },
  { size: PHOTO_SIZE, quality: 0.55 },
  { size: 192, quality: 0.5 },
  { size: 128, quality: 0.45 },
]

/** Something to show the person who picked the photo, rather than a stack trace. */
export class PhotoError extends Error {}

/**
 * Reads a picked file into a small square data URL.
 *
 * Throws `PhotoError` with a line worth showing when the file isn't an image
 * the browser can open — which on a phone is usually a video picked by mistake.
 */
export async function photoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError("That isn't a picture. Pick a photo instead.")
  }

  const source = await decode(file)

  for (const attempt of ATTEMPTS) {
    const url = drawSquare(source, attempt.size, attempt.quality)
    if (url.length <= MAX_PHOTO_CHARS) {
      release(source)
      return url
    }
  }

  release(source)
  // Every attempt overshot, which a photograph cannot really do at 128px — so
  // this is something pathological rather than a big picture.
  throw new PhotoError("Couldn't shrink that picture down. Try a different one.")
}

type Source = ImageBitmap | HTMLImageElement

async function decode(file: File): Promise<Source> {
  // createImageBitmap is the one that can be told to apply the camera's
  // orientation, which is the difference between a portrait photo and a
  // sideways one. Not everywhere, hence the fallback.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through: some browsers refuse formats they can still render in an
      // <img>, HEIC off an iPhone among them.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    URL.revokeObjectURL(url)
    throw new PhotoError("Couldn't open that picture. Try a different one.")
  }
}

function release(source: Source): void {
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
  else if (source instanceof HTMLImageElement && source.src.startsWith('blob:')) {
    URL.revokeObjectURL(source.src)
  }
}

/**
 * The middle square of the picture, drawn at `size` and encoded as JPEG.
 *
 * The middle rather than the top: a phone photo of a person is usually framed
 * with them in it, and cropping from the top would decapitate anyone in a
 * landscape shot.
 */
function drawSquare(source: Source, size: number, quality: number): string {
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height
  const edge = Math.min(width, height)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new PhotoError("This browser can't resize pictures.")

  ctx.drawImage(source, (width - edge) / 2, (height - edge) / 2, edge, edge, 0, 0, size, size)
  // JPEG rather than PNG: these are photographs, and a PNG of one is several
  // times the size for no visible gain at 256 pixels.
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * The letter shown in place of a photo.
 *
 * The first letter of the name, which is what a person scanning a grid of faces
 * for @jenna is looking for.
 */
export function avatarLetter(username: string): string {
  const letter = username.trim().match(/[a-zA-Z0-9]/)?.[0]
  return (letter ?? '?').toUpperCase()
}

/**
 * A stable colour for a name, so a friend without a photo is still the same
 * tile every time you open the page — recognisable by colour before it is read.
 *
 * Deliberately not the game's palette: these sit next to board colours on the
 * same screen, and a face the colour of a seat reads as a claim about which
 * seat that person is in.
 */
export function avatarHue(username: string): number {
  let hash = 0
  for (const char of username.trim().toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360
  }
  return hash
}
