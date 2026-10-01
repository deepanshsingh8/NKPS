import "server-only";
import { headers } from "next/headers";

/**
 * The per-request CSP nonce the proxy generated (see ./csp.ts), for a Server
 * Component that renders its own inline <script> or a next/script tag.
 *
 * Reading headers() makes the caller dynamic, which nonce-based CSP requires
 * anyway: a statically prerendered page has no request, so no nonce, and its
 * scripts would all be blocked. The ERP and CMS root layouts call this, which
 * opts every page in both apps into dynamic rendering.
 */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
