import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Prepare a response so Supabase can attach auth cookies
    let response = NextResponse.json({});

    const supabase = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies) {
            cookies.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      // Check if user already exists but is unconfirmed
      if (error.message.toLowerCase().includes("user already registered")) {
        return NextResponse.json(
          {
            error:
              "An account with this email already exists. Please check your email for a confirmation link, or use the resend confirmation page if the link has expired.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if user was created but needs email confirmation
    if (data.user && !data.user.email_confirmed_at) {
      return NextResponse.json(
        {
          success: true,
          message:
            "Account created successfully! Please check your email and click the confirmation link to activate your account. If you don't see the email, check your spam folder.",
        },
        { status: 200 }
      );
    }

    response = NextResponse.json(
      { success: true, user: data.user },
      { status: 200 }
    );
    return response;
  } catch (error) {
    console.error("Sign up error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
