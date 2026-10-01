// Pure string helper, kept out of lib/articles.ts: that module pulls in the
// service-role client (server-only), and the CMS articles page — a client
// component — needs only this.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
