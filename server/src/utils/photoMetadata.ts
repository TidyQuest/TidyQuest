import fs from 'fs';

// Photos without location (NEW-34). The app redraws every photo in the browser before it uploads it, which
// leaves the camera's metadata behind; this is the server's safety net for anything that arrives another
// way. It removes what can say where and with what a photo was taken (EXIF with GPS, XMP, comments, text,
// thumbnails and extra images after the picture) without decoding the picture itself.

/** A JPEG without its APP1–APP15 segments (except Adobe's APP14, which decoding needs), comments, or anything after the end. */
export function jpegWithoutMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; } // fill byte
    if (marker === 0xd9) {
      parts.push(buf.subarray(i, i + 2));
      return Buffer.concat(parts);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { // markers with no length
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return null;
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (end > buf.length || end < i + 4) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe;
    if (!metadata) parts.push(buf.subarray(i, end));
    i = end;
    if (marker === 0xda) {
      // The picture data runs until the next marker that isn't a stuffed 0xFF00 or a restart marker
      let j = i;
      for (;;) {
        j = buf.indexOf(0xff, j);
        if (j < 0 || j + 1 >= buf.length) return null;
        const next = buf[j + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { j += 2; continue; }
        if (next === 0xff) { j++; continue; }
        break;
      }
      parts.push(buf.subarray(i, j));
      i = j;
    }
  }
  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/** A PNG without its EXIF, text and time chunks, or anything after the end. */
export function pngWithoutMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const parts: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  while (i + 12 <= buf.length) {
    const end = i + 12 + buf.readUInt32BE(i);
    if (end > buf.length) return null;
    const type = buf.toString('latin1', i + 4, i + 8);
    if (!PNG_METADATA.has(type)) parts.push(buf.subarray(i, end));
    if (type === 'IEND') return Buffer.concat(parts);
    i = end;
  }
  return null;
}

/** A WebP without its EXIF and XMP chunks (and the header flags that announced them). */
export function webpWithoutMetadata(buf: Buffer): Buffer | null {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const parts: Buffer[] = [];
  let i = 12;
  const riffEnd = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  while (i + 8 <= riffEnd) {
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > riffEnd) return null;
    const type = buf.toString('latin1', i, i + 4);
    if (type === 'VP8X') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(end, riffEnd)));
      chunk[8] &= ~(0x08 | 0x04); // no EXIF, no XMP
      parts.push(chunk);
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      parts.push(buf.subarray(i, Math.min(end, riffEnd)));
    }
    i = end;
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/**
 * Rewrites an uploaded photo without its metadata. False when it isn't a JPEG, PNG or WebP this can read
 * (then the file is left as it is; hosted mode refuses it).
 */
export function stripPhotoMetadata(file: string): boolean {
  const buf = fs.readFileSync(file);
  const clean = jpegWithoutMetadata(buf) ?? pngWithoutMetadata(buf) ?? webpWithoutMetadata(buf);
  if (!clean) return false;
  if (!clean.equals(buf)) fs.writeFileSync(file, clean);
  return true;
}
