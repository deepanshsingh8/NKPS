import { AskChat } from "@/components/ask/AskChat";

/**
 * Ask-your-school lives in the LAYOUT, not the page.
 *
 * The first answer in a new chat moves the URL from /reports/ask to
 * /reports/ask/<id>. Those are two values of the `[[...slug]]` segment, and
 * the router keys a page by its segment value — so a chat held in the page
 * was unmounted and remounted mid-answer. The live transcript, the progress
 * list and the stream reading the answer all went with it, the fresh copy
 * printed "Opening…" over a chat whose answer had not been saved yet, and the
 * screen sat blank until you navigated away and back.
 *
 * A layout above the segment is not keyed by it and survives the change, so
 * the chat is rendered here and the page renders nothing.
 */
export default function AskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AskChat />
      {children}
    </>
  );
}
