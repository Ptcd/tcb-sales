import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = await createClient();

    console.log("Resending confirmation email for:", email);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email,
    });

    if (error) {
      console.log("Resend error:", error.message);

      // Check if user doesn't exist or is already confirmed
      if (
        error.message.toLowerCase().includes("user not found") ||
        error.message.toLowerCase().includes("already confirmed")
      ) {
        return NextResponse.json(
          {
            error:
              "No pending confirmation found for this email. Please sign up first or check if your account is already confirmed.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log("Confirmation email sent successfully for:", email);
    return NextResponse.json({
      message:
        "Confirmation email sent successfully. Please check your inbox and spam folder.",
    });
  } catch (error) {
    console.log("Resend confirmation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
