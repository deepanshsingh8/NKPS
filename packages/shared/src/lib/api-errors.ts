import { NextResponse } from "next/server";

// Turning a database error into something safe to send to the browser.
//
// A Supabase / PostgREST error's `message` names the table, the column and the
// constraint ("duplicate key value violates unique constraint
// \"fee_payments_receipt_number_key\""), and its `details` can echo the row's
// values back. None of that belongs in a response body. Routes log the full
// error server-side and send one of the fixed sentences below instead.
//
// Routes that already build their own friendly sentence for a specific case
// (a duplicate admission number, a teacher double-booked) keep doing so; this
// is for the fall-through branch that used to return `error.message`.

export interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export type DbWriteKind = "insert" | "update" | "delete";

export interface FriendlyDbError {
  message: string;
  // Only set when the error itself decides the status (a permission denial).
  status?: number;
}

export const GENERIC_DB_ERROR = "Something went wrong. Please try again.";

function asDbError(error: unknown): DbErrorLike {
  if (error && typeof error === "object") return error as DbErrorLike;
  if (typeof error === "string") return { message: error };
  return {};
}

/**
 * Maps a database error to a sentence that is safe to show a user. Pure: it
 * neither logs nor throws, so it can be used where a route has to embed the
 * text in a bigger message or a warnings list.
 *
 * `kind` disambiguates a foreign-key violation (23503). When it is omitted the
 * message text decides: Postgres says "is still referenced" only when the
 * offending row is the one being deleted.
 */
export function friendlyDbError(error: unknown, kind?: DbWriteKind): FriendlyDbError {
  const e = asDbError(error);
  const code = e.code ?? "";
  const text = `${e.message ?? ""} ${e.details ?? ""}`;

  switch (code) {
    case "23505":
      return { message: "That already exists." };
    case "23503": {
      const isDelete =
        kind === "delete" || (kind === undefined && /still referenced/i.test(text));
      return {
        message: isDelete
          ? "It's still referenced by other records."
          : "It refers to something that doesn't exist.",
      };
    }
    case "23502":
    case "23514":
      return { message: "Some required information is missing or invalid." };
    case "23P01":
      return { message: "That clashes with an existing record." };
    case "42501":
    case "PGRST301":
      return { message: "You don't have permission to do that.", status: 403 };
  }
  // Class 22 is "data exception": a malformed uuid, a date out of range, a
  // string longer than its column. Always bad input rather than a fault.
  if (/^22[0-9A-Z]{3}$/.test(code)) {
    return { message: "Some required information is missing or invalid." };
  }
  return { message: GENERIC_DB_ERROR };
}

/**
 * Logs the full error under `context`, for a route that reports the failure
 * in its own words (a warning that names the step that failed) and only needs
 * the detail kept server-side.
 */
export function logDbError(error: unknown, context: string): void {
  console.error(`[${context}]`, error);
}

/**
 * Logs the full error under `context` and returns the friendly sentence.
 * For places that need the text rather than a Response (a warnings array, an
 * error field inside a larger payload, a helper that returns `{ error }`).
 */
export function dbErrorMessage(error: unknown, context: string, kind?: DbWriteKind): string {
  logDbError(error, context);
  return friendlyDbError(error, kind).message;
}

/**
 * Logs the full error under `context` and returns `{ error: <friendly> }`.
 * `status` is used unless the error itself is a permission denial (403).
 * `extra` is merged into the body for routes whose clients read more fields
 * (e.g. `partial: true` after a half-finished batch).
 */
export function dbErrorResponse(
  error: unknown,
  context: string,
  status = 500,
  options: { kind?: DbWriteKind; extra?: Record<string, unknown> } = {}
): NextResponse {
  logDbError(error, context);
  const friendly = friendlyDbError(error, options.kind);
  return NextResponse.json(
    { ...(options.extra ?? {}), error: friendly.message },
    { status: friendly.status ?? status }
  );
}
