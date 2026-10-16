// iPhone photos arrive as HEIC, which Chromium (the editor preview and the export renderer) cannot draw. Upstream
// converts them only on the phone-upload path; this does the same for every file import, before upload.
import { heicTo } from 'heic-to/csp';

const HEIC_MIME = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);

export function isHeicFile(file: { name: string; type: string }): boolean {
  return HEIC_MIME.has(file.type.toLowerCase()) || /\.(?:heic|heif)$/i.test(file.name);
}

export function jpegNameFor(name: string): string {
  const replaced = name.replace(/\.(?:heic|heif)$/i, '.jpg');
  return replaced === name ? `${name}.jpg` : replaced;
}

/** The file itself, or a JPEG copy of a HEIC photo. A failed conversion keeps the original (the export converts it). */
export async function heicAsJpeg(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  try {
    const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    const jpeg = Array.isArray(converted) ? converted[0] : converted;
    if (!(jpeg instanceof Blob)) return file;
    return new File([jpeg], jpegNameFor(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
