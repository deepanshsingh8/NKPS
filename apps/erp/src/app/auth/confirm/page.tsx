import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { SCHOOL } from "@nkps/shared/lib/constants";
import { linkErrorPath, parseOtpType, safeNext } from "@/lib/auth-confirm";

// GET /auth/confirm — the page every emailed set-password / sign-in link opens.
//
// It deliberately does NOT verify the token. Mail scanners open every link in
// a message before the person does, and a GET that spent the one-time token
// left the real recipient with "invalid or expired". This page only shows a
// Continue button; the token is spent by the form's POST to
// /auth/confirm/verify, which scanners do not send.
//
// A plain HTML form with no client JS, so it works before hydration, with
// scripts blocked, and under a nonce-based CSP.

export const metadata: Metadata = {
  title: `Continue | ${SCHOOL.shortName} Portal`,
  robots: { index: false, follow: false },
  // The URL carries the token. Nothing on this page loads from another
  // origin, but no-referrer guarantees it never leaves in a Referer header.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const type = parseOtpType(first(params.type));
  const next = safeNext(first(params.next));

  if (!tokenHash || !type) redirect(linkErrorPath(next, "missing_token"));

  const settingPassword = type === "recovery" || type === "invite";

  return (
    <main className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-cream-50 dark:bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-card rounded-2xl shadow-xl border border-gray-100 dark:border-border p-6 sm:p-8 text-center">
          <Image
            src="/images/logo.png"
            alt=""
            width={64}
            height={64}
            className="mx-auto mb-3 h-16 w-16 object-contain"
          />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{SCHOOL.name}</p>

          <div className="mx-auto mt-6 mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/10">
            <KeyRound aria-hidden="true" className="h-7 w-7 text-gold-600 dark:text-gold-400" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-navy-900 dark:text-white">
            {settingPassword ? "Set your password" : "Continue to the portal"}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {settingPassword
              ? "Click Continue to set your password."
              : "Click Continue to finish signing in."}
          </p>

          <form method="POST" action="/auth/confirm/verify" className="mt-6">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-navy-900 px-4 text-base font-medium text-white transition-colors hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 dark:bg-gold-500 dark:text-navy-900 dark:hover:bg-gold-400 dark:focus-visible:ring-offset-card"
            >
              Continue
            </button>
          </form>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            This link works once. If you didn&apos;t ask for it, you can close this page.
          </p>
        </div>
      </div>
    </main>
  );
}
