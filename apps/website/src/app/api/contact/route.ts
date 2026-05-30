import { NextResponse } from "next/server";
import { promises as dns } from "node:dns";
import { createAdminClient } from "@nkps/shared/lib/supabase/admin";
import { contactFormSchema, emailDomain } from "@nkps/shared/lib/validations";
import { SCHOOL } from "@nkps/shared/lib/constants";
import { rateLimit, clientIp } from "@nkps/shared/lib/rate-limit";

// DNS lookups need the Node.js runtime (not edge).
export const runtime = "nodejs";

/**
 * Verify the email's domain can actually receive mail (has MX, or at least an
 * A/AAAA record as a fallback per RFC 5321). Definitive "no such domain" /
 * "no records" → reject. Transient DNS errors → fail open so a hiccup doesn't
 * block a legitimate visitor.
 */
async function emailDomainCanReceiveMail(email: string): Promise<boolean> {
  const domain = emailDomain(email);
  if (!domain || !domain.includes(".")) return false;
  try {
    const mx = await dns.resolveMx(domain);
    if (Array.isArray(mx) && mx.length > 0) return true;
    // No MX → implicit MX is the A/AAAA record (RFC 5321 §5.1).
    try {
      await dns.lookup(domain);
      return true;
    } catch {
      return false;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      // No MX records; fall back to A/AAAA before rejecting.
      try {
        await dns.lookup(domain);
        return true;
      } catch {
        return false;
      }
    }
    // Transient resolver error — don't block the submission.
    return true;
  }
}

export async function POST(request: Request) {
  try {
    // Cap contact form to 5 submissions / IP / hour to keep the admin inbox
    // clean. Honest visitors rarely submit twice in a row.
    const ipLimit = rateLimit({
      name: "contact:ip",
      key: clientIp(request),
      max: 5,
      windowSeconds: 60 * 60,
    });
    if (!ipLimit.ok) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const result = contactFormSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid form data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    // Reject emails whose domain can't receive mail (catches typos like
    // "@gmial.com" and made-up domains that still pass format validation).
    const reachable = await emailDomainCanReceiveMail(result.data.email);
    if (!reachable) {
      return NextResponse.json(
        { error: "Please enter a working email address — its domain can't receive mail." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase.from("contact_submissions").insert({
      full_name: result.data.fullName,
      email: result.data.email,
      phone: result.data.phone,
      subject: result.data.subject,
      message: result.data.message,
      is_read: false,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to submit form" },
        { status: 500 }
      );
    }

    // Send notification email to admin (non-blocking)
    try {
      const { sendEmail, buildContactNotificationEmail } = await import(
        "@nkps/shared/lib/email"
      );
      const adminEmail =
        process.env.ADMIN_NOTIFICATION_EMAIL || SCHOOL.email[0];
      const html = buildContactNotificationEmail({
        fullName: result.data.fullName,
        email: result.data.email,
        phone: result.data.phone,
        subject: result.data.subject,
        message: result.data.message,
      });
      await sendEmail(
        adminEmail,
        `New Contact: ${result.data.subject}`,
        html
      );
    } catch (emailError) {
      console.error("Failed to send contact notification email:", emailError);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
