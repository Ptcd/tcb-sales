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

    // Carrier for cookies set by Supabase during sign-in
    const cookieCarrier = NextResponse.next();

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
              cookieCarrier.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Handle email confirmation errors
      const errorLower = error.message.toLowerCase();

      if (
        errorLower.includes("email not confirmed") ||
        errorLower.includes("email_confirmation") ||
        errorLower.includes("unconfirmed")
      ) {
        return new NextResponse(
          JSON.stringify({
            error:
              "Please check your email and click the confirmation link to activate your account. If you don't see the email, check your spam folder.",
          }),
          { status: 400, headers: cookieCarrier.headers }
        );
      }

      // Handle invalid credentials
      if (errorLower.includes("invalid login credentials")) {
        return new NextResponse(
          JSON.stringify({
            error:
              "Unable to sign in. Please check your email for a confirmation link if you just signed up, or verify your credentials.",
          }),
          { status: 400, headers: cookieCarrier.headers }
        );
      }

      return new NextResponse(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: cookieCarrier.headers,
      });
    }

    return new NextResponse(
      JSON.stringify({ success: true, user: data.user }),
      { status: 200, headers: cookieCarrier.headers }
    );
  } catch (error) {
    console.error("Sign in error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
