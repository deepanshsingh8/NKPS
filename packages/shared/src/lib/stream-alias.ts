// Resolving a stream NAME to the stream row the school actually keeps.
//
// The school's own vocabulary and everyone else's disagree. The ERP stores the
// humanities stream as "Humanities"; the previous software's exports, the
// bulk-upload sheets people hand in, and the classes printed on a fee receipt
// all say "Arts". Both mean the same eleven students.
//
// Matching on the literal name is the failure this module exists to prevent,
// and it fails quietly in both directions: a lookup misses, so a real stream
// looks absent — and then the caller "helpfully" creates a second stream row
// beside the first, along with duplicate classes hanging off it. Nothing
// errors. You find out when a class appears twice in a dropdown.
//
// This logic lived inside api/students/bulk. It is here so every importer
// shares one answer.

export interface StreamRow {
  id: string;
  name: string;
}

/**
 * Canonical stream name → other spellings that mean the same stream.
 *
 * Keyed on the name as the ERP stores it. Add a spelling here rather than
 * renaming the stream: the name is printed on marksheets and TCs.
 */
export const STREAM_ALIASES: Record<string, string[]> = {
  humanities: ["arts", "art", "humanities stream", "arts stream", "hum"],
  science: ["sci", "science stream"],
  commerce: ["comm", "commerce stream", "comm."],
};

function normalize(name: string): string {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a name → stream_id lookup that answers to aliases as well as to the
 * stored name. Pass every row of `streams`.
 */
export function buildStreamLookup(streams: StreamRow[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const s of streams) {
    const canonical = normalize(s.name);
    lookup.set(canonical, s.id);
    for (const alias of STREAM_ALIASES[canonical] ?? []) {
      // A stored stream never loses to an alias of a different one.
      if (!lookup.has(alias)) lookup.set(alias, s.id);
    }
  }
  // A stored stream named by one of its own aliases ("Arts") still answers to
  // the canonical name, so callers can ask either way.
  for (const [canonical, aliases] of Object.entries(STREAM_ALIASES)) {
    if (lookup.has(canonical)) continue;
    for (const alias of aliases) {
      const id = lookup.get(alias);
      if (id) {
        lookup.set(canonical, id);
        break;
      }
    }
  }
  return lookup;
}

/** `null` for a blank name, or when no stored stream matches. */
export function resolveStreamId(
  lookup: Map<string, string>,
  name: string | null | undefined
): string | null {
  if (!name) return null;
  return lookup.get(normalize(name)) ?? null;
}

/**
 * True when the school has no stream that this name could mean.
 *
 * Use this — never `!lookup.has(name)` on a bare name — before creating a
 * stream, so "Arts" cannot spawn a twin of "Humanities".
 */
export function streamIsMissing(
  lookup: Map<string, string>,
  name: string | null | undefined
): boolean {
  return Boolean(name) && resolveStreamId(lookup, name) === null;
}
