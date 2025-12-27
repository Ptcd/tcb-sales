import Link from "next/link";
import { getUser } from "@/app/actions/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getUser();

  // If user is already logged in, redirect to dashboard
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-700">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold text-slate-800">
                Maps Dashboard
              </span>
            </div>
            <Link
              href="/login"
              className="rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-2 text-sm font-semibold text-white hover:from-slate-700 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-[1400px] px-4 py-16">
        <div className="text-center">
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Business Discovery
              <span className="block bg-gradient-to-r from-slate-600 to-emerald-600 bg-clip-text text-transparent">
                Made Simple
              </span>
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
              Find and export business data from Google Maps instantly. Perfect
              for lead generation, market research, and competitive analysis.
            </p>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 px-8 py-4 text-sm font-semibold text-white hover:from-slate-700 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all duration-200"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-xl border-2 border-slate-300 bg-white px-8 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-20 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="group rounded-2xl bg-white p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-200 hover:border-slate-300">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-emerald-100 group-hover:to-emerald-200 transition-all duration-300">
              <svg
                className="h-8 w-8 text-slate-600 group-hover:text-emerald-600 transition-colors duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">
              Smart Search
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Advanced search by keyword and location with intelligent filtering
              and autocomplete suggestions.
            </p>
          </div>

          <div className="group rounded-2xl bg-white p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-200 hover:border-slate-300">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-emerald-100 group-hover:to-emerald-200 transition-all duration-300">
              <svg
                className="h-8 w-8 text-slate-600 group-hover:text-emerald-600 transition-colors duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">Rich Data</h3>
            <p className="text-slate-600 leading-relaxed">
              Get comprehensive business information including contact details,
              ratings, reviews, and location data.
            </p>
          </div>

          <div className="group rounded-2xl bg-white p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-slate-200 hover:border-slate-300">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-emerald-100 group-hover:to-emerald-200 transition-all duration-300">
              <svg
                className="h-8 w-8 text-slate-600 group-hover:text-emerald-600 transition-colors duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="mb-3 text-xl font-bold text-slate-900">
              Export Easily
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Download your results as CSV or Excel files with one click for
              easy analysis and sharing.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
