import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  try {
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
    const { error } = await supabase.auth.signOut();

    // Regardless of Supabase error, aggressively clear any sb-* cookies
    const incomingCookies = request.cookies.getAll();
    incomingCookies
      .filter((c) => c.name.toLowerCase().startsWith("sb-"))
      .forEach((c) => {
        response.cookies.set(c.name, "", {
          maxAge: 0,
          path: "/",
        });
      });

    if (error) {
      // Return success but include cleared cookies so the client stops looping
      response = NextResponse.json({ success: true }, { status: 200 });
      return response;
    }

    response = NextResponse.json({ success: true }, { status: 200 });
    return response;
  } catch (error) {
    console.error("Sign out error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
