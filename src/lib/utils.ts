import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format class display name with section and optional stream.
 * e.g. "XII - A (Science)", "V - B"
 * Handles stream_name as string, or streams join as object or array from Supabase.
 */
export function formatClassName(cls: {
  name: string;
  section: string;
  stream_name?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streams?: any;
}): string {
  let stream: string | null = null;
  if (cls.stream_name) {
    stream = cls.stream_name;
  } else if (cls.streams) {
    // Supabase FK join may return object or array depending on query
    if (Array.isArray(cls.streams)) {
      stream = cls.streams[0]?.name ?? null;
    } else {
      stream = cls.streams.name ?? null;
    }
  }
  if (stream) {
    return `${cls.name} - ${cls.section} (${stream})`;
  }
  return `${cls.name} - ${cls.section}`;
}
