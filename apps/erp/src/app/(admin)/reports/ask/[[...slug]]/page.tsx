/**
 * Intentionally empty: the chat is rendered by ../layout.tsx, which survives
 * the /reports/ask → /reports/ask/<id> change that remounts this page. See
 * the note there. This file exists so both URLs resolve.
 */
export default function AskPage() {
  return null;
}
