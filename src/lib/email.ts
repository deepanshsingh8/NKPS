import { Resend } from "resend";
import { SCHOOL } from "@/lib/constants";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || `${SCHOOL.name} <onboarding@resend.dev>`;

export async function sendEmail(to: string, subject: string, html: string) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Resend API error:", JSON.stringify(error));
    throw new Error(`Email send failed: ${error.message}`);
  }

  console.log("Email sent successfully:", data?.id);
  return { data, error };
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper with school branding
// ---------------------------------------------------------------------------

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f8f7f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f7f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a2332;padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
              <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:700;">${SCHOOL.name}</h1>
              <p style="margin:8px 0 0;font-size:13px;color:#d4a843;letter-spacing:1px;">${SCHOOL.tagline}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-left:1px solid #e5e5e5;border-right:1px solid #e5e5e5;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f1f1f1;padding:24px 40px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
              <p style="margin:0;font-size:12px;color:#888;text-align:center;">
                ${SCHOOL.address.full}<br>
                ${SCHOOL.email[0]} &middot; ${SCHOOL.phone[0]}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

interface WelcomeEmailParams {
  fullName: string;
  email: string;
  password: string;
  loginUrl: string;
  role: string;
}

export function buildWelcomeEmail({ fullName, email, password, loginUrl, role }: WelcomeEmailParams): string {
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a2332;">Welcome to ${SCHOOL.shortName} Portal!</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
      Hello <strong>${fullName}</strong>,<br>
      Your <strong>${role}</strong> account has been created on the ${SCHOOL.name} portal. Here are your login details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf8f3;border:1px solid #e8e4d9;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="margin:0 0 8px;font-size:13px;color:#888;">Email / Username</p>
          <p style="margin:0 0 16px;font-size:15px;color:#1a2332;font-weight:600;">${email}</p>
          <p style="margin:0 0 8px;font-size:13px;color:#888;">Temporary Password</p>
          <p style="margin:0;font-size:15px;color:#1a2332;font-weight:600;font-family:monospace;letter-spacing:0.5px;">${password}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:14px;color:#d97706;line-height:1.5;">
      You will be asked to set a new password on your first login.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="background-color:#1a2332;border-radius:8px;">
          <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
            Sign In to Portal
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:13px;color:#888;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${loginUrl}" style="color:#d4a843;word-break:break-all;">${loginUrl}</a>
    </p>
  `);
}

interface RegistrationReceivedParams {
  fullName: string;
  role: string;
}

export function buildRegistrationReceivedEmail({ fullName, role }: RegistrationReceivedParams): string {
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a2332;">Registration Received</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
      Hello <strong>${fullName}</strong>,<br>
      Thank you for registering as a <strong>${role}</strong> on the ${SCHOOL.name} portal.
    </p>
    <div style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#0369a1;line-height:1.6;">
        Your registration is now <strong>pending review</strong> by the school administration.
        You will receive another email once your account has been approved.
      </p>
    </div>
    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">
      If you have any questions, please contact us at
      <a href="mailto:${SCHOOL.email[0]}" style="color:#d4a843;">${SCHOOL.email[0]}</a>
      or call <strong>${SCHOOL.phone[0]}</strong>.
    </p>
  `);
}

interface RegistrationRejectedParams {
  fullName: string;
  reason?: string;
}

export function buildRegistrationRejectedEmail({ fullName, reason }: RegistrationRejectedParams): string {
  const reasonBlock = reason
    ? `<div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;color:#888;">Reason</p>
        <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.5;">${reason}</p>
      </div>`
    : "";

  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a2332;">Registration Update</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
      Hello <strong>${fullName}</strong>,<br>
      We regret to inform you that your registration request for the ${SCHOOL.name} portal was not approved at this time.
    </p>
    ${reasonBlock}
    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">
      If you believe this was a mistake or have questions, please contact us at
      <a href="mailto:${SCHOOL.email[0]}" style="color:#d4a843;">${SCHOOL.email[0]}</a>
      or call <strong>${SCHOOL.phone[0]}</strong>.
    </p>
  `);
}

// ---------------------------------------------------------------------------
// Contact Form Notification (sent to admin)
// ---------------------------------------------------------------------------

interface ContactNotificationParams {
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export function buildContactNotificationEmail({
  fullName,
  email,
  phone,
  subject,
  message,
}: ContactNotificationParams): string {
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a2332;">New Contact Form Submission</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#888;width:80px;vertical-align:top;">Name</td>
        <td style="padding:8px 0;font-size:15px;color:#1a2332;font-weight:600;">${fullName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#888;vertical-align:top;">Email</td>
        <td style="padding:8px 0;font-size:15px;color:#1a2332;">
          <a href="mailto:${email}" style="color:#d4a843;">${email}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#888;vertical-align:top;">Phone</td>
        <td style="padding:8px 0;font-size:15px;color:#1a2332;">${phone}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#888;vertical-align:top;">Subject</td>
        <td style="padding:8px 0;font-size:15px;color:#1a2332;font-weight:600;">${subject}</td>
      </tr>
    </table>
    <div style="background-color:#faf8f3;border:1px solid #e8e4d9;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;color:#888;">Message</p>
      <p style="margin:0;font-size:14px;color:#1a2332;line-height:1.6;white-space:pre-wrap;">${message}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#888;">
      This submission has been saved to the admin dashboard. You can view and manage all messages from the Contact section.
    </p>
  `);
}
