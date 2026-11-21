// Which build this code came from.
//
// NEXT_PUBLIC_BUILD_ID is set in each app's next.config.ts at build time —
// from the deployed commit on Vercel, else from the clock — so the client
// bundle and the server functions of one deployment carry the same value, and
// two deployments carry different ones. /api/version returns the server's;
// PWARegister compares it with the page's own, and offers a reload when they
// differ.
//
// Why: a browser window left open on a page keeps running the bundle it
// loaded, for days if nobody navigates. Nothing told the fee office that the
// window beside them was showing a newer build — the same student read
// differently in two windows, and the older one looked like a bug.
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
