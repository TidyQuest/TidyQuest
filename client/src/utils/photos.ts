// Phone cameras make photos of several MB, more than the server takes (5 MB hosted, 8 MB self-hosted, avatars 2 MB),
// and they carry where and with what they were taken (EXIF: GPS, camera, time). Before uploading, the browser draws
// every photo again as a JPEG of a few hundred KB, which leaves all of that behind (NEW-34). A photo the browser
// can't read (some HEIC files) is refused with code 'photo-type', like the server does in hosted mode; the
// server also strips what it can as a safety net.

/** Proof photos: 1600 px on the long side is plenty to check a chore. */
export const PROOF_PHOTO = { maxSide: 1600, quality: 0.8 };
/** Avatars show at most a few hundred pixels wide. */
export const AVATAR_PHOTO = { maxSide: 512, quality: 0.85 };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

/** The error for a photo that can't be redrawn: limitError() and hostedError() show it in the page's language. */
const unreadable = () => Object.assign(new Error("That photo couldn't be read"), { body: { code: 'photo-type' } });

export async function shrinkPhoto(file: File, { maxSide, quality }: { maxSide: number; quality: number }): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw unreadable();
  let img: HTMLImageElement;
  try {
    // An <img> turns the photo upright from its EXIF orientation, and drawing it keeps that
    img = await loadImage(file);
  } catch {
    throw unreadable();
  }
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw unreadable();
  // JPEG has no transparency: a see-through PNG gets a white background instead of black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Always the redrawn copy, even when it's bigger: the original still has its EXIF
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw unreadable();
  const name = file.name.replace(/\.[^.]*$/, '') || 'photo';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
}
