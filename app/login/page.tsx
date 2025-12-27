import Link from "next/link";
import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export const metadata = {
  title: "Sign In - Google Maps Data Dashboard",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>

        <div className="rounded-xl bg-white px-10 py-12 shadow-lg">
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          }>
            <AuthForm mode="login" />
          </Suspense>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link
              href="/signup"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Sign up
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500">
          Google Maps Data Dashboard - Secure Business Search Tool
        </p>
      </div>
    </div>
  );
}
