// Identify an uploaded file by its leading bytes, not by what the browser says.
//
// `File.type` comes from the client and is trivially spoofable — an HTML or
// SVG page renamed to `.png` arrives as `image/png`, gets stored under that
// content type, and becomes an XSS surface the moment storage serves it back.
// Upload routes call `sniffUpload(file, allowed)` and then store with the
// returned `mime`/`ext`, never with `file.type`.

export type SniffedKind = "jpeg" | "png" | "webp" | "pdf";

export interface SniffedFile {
  kind: SniffedKind;
  mime: string;
  ext: string;
}

const INFO: Record<SniffedKind, Omit<SniffedFile, "kind">> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
  pdf: { mime: "application/pdf", ext: "pdf" },
};

function startsWith(head: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (head.length < offset + sig.length) return false;
  return sig.every((b, i) => head[offset + i] === b);
}

function detect(head: Uint8Array): SniffedKind | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // RIFF....WEBP
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  // %PDF-
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  return null;
}

/**
 * Read the first 12 bytes of `file` and return what it actually is, provided
 * that is one of `allowed`. Returns null for anything else, including a file
 * too short to identify.
 */
export async function sniffUpload(
  file: Blob,
  allowed: readonly SniffedKind[],
): Promise<SniffedFile | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const kind = detect(head);
  if (!kind || !allowed.includes(kind)) return null;
  return { kind, ...INFO[kind] };
}
