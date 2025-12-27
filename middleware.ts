import { type NextRequest, NextResponse } from "next/server";

function hasSupabaseAuthCookies(request: NextRequest): boolean {
  // Supabase may set cookies like:
  // - sb-access-token
  // - sb-refresh-token
  // - sb-<project-ref>-auth-token (structured JSON)
  const cookies = request.cookies.getAll();
  if (!cookies || cookies.length === 0) return false;

  for (const c of cookies) {
    const name = c.name.toLowerCase();
    if (
      name === "sb-access-token" ||
      name === "sb-refresh-token" ||
      (name.startsWith("sb-") &&
        (name.includes("auth") || name.includes("token")))
    ) {
      if (c.value && c.value.length > 0) return true;
    }
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for API routes and static assets
  if (pathname.startsWith("/api")) return NextResponse.next();

  const isAuthed = hasSupabaseAuthCookies(request);

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthed) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Do not force-redirect from auth pages to avoid loops; allow pages to handle it

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (handled by API routes themselves)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
