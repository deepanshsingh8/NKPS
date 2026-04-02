import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactFormSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = contactFormSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid form data", details: result.error.flatten() },
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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
