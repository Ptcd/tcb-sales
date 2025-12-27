"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signUp } from "@/app/actions/auth";
import { LoadingSpinner } from "./LoadingSpinner";

type AuthResult = { error: string } | { error: string; success: true };

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{email: string, organizationName: string, role: string} | null>(null);
  const [emailValue, setEmailValue] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get('invite');

  // Verify invitation token if present
  useEffect(() => {
    if (inviteToken && mode === 'signup') {
      fetch(`/api/team/verify-invite?token=${inviteToken}`)
        .then(res => res.json())
        .then(data => {
          if (data.valid) {
            const inviteData = {
              email: data.email,
              organizationName: data.organizationName,
              role: data.role
            };
            setInviteInfo(inviteData);
            setEmailValue(data.email); // Pre-fill email for signup
          } else {
            setError(data.error || 'Invalid invitation link');
          }
        })
        .catch(err => {
          console.error('Error verifying invitation:', err);
          setError('Failed to verify invitation');
        });
    }
  }, [inviteToken, mode]);

  // Persistent timer for resend cooldown
  useEffect(() => {
    const savedCooldown = localStorage.getItem("resendCooldown");
    const savedTimestamp = localStorage.getItem("resendTimestamp");

    if (savedCooldown && savedTimestamp) {
      const elapsed = Math.floor(
        (Date.now() - parseInt(savedTimestamp)) / 1000
      );
      const remaining = Math.max(0, parseInt(savedCooldown) - elapsed);
      setResendCooldown(remaining);
    }
  }, []);

  // Timer countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        const newCooldown = resendCooldown - 1;
        setResendCooldown(newCooldown);

        // Update localStorage to maintain persistence
        if (newCooldown > 0) {
          localStorage.setItem("resendCooldown", newCooldown.toString());
        } else {
          localStorage.removeItem("resendCooldown");
          localStorage.removeItem("resendTimestamp");
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setUnconfirmedEmail(null);
    setLoading(true);

    // Get form element reference before async operations
    const formElement = e.currentTarget;
    if (!formElement) {
      setError("Form submission failed. Please try again.");
      setLoading(false);
      return;
    }

    // Small delay to ensure error state is cleared before processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    const formData = new FormData(formElement);
    const email = formData.get("email") as string;

    try {
      const result: AuthResult =
        mode === "login" ? await signIn(formData) : await signUp(formData);

      if (result?.error) {
        if ("success" in result && result.success && mode === "signup") {
          setSuccess(true);
          setError(null);
          
          // If this is an invitation-based signup, accept the invitation
          if (inviteToken) {
            try {
              // Wait a bit for the user to be created
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Get the newly created user ID
              const userResponse = await fetch('/api/auth/user');
              const userData = await userResponse.json();
              
              if (userData.user?.id) {
                const acceptResponse = await fetch('/api/team/accept-invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: inviteToken,
                    userId: userData.user.id
                  })
                });
                
                if (!acceptResponse.ok) {
                  console.error('Failed to accept invitation');
                }
              }
            } catch (inviteError) {
              console.error('Error accepting invitation:', inviteError);
            }
          }
          
          // Set resend cooldown for new signups
          setResendCooldown(60); // 60 seconds cooldown
          localStorage.setItem("resendCooldown", "60");
          localStorage.setItem("resendTimestamp", Date.now().toString());
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        } else {
          // Check if this is an unconfirmed user error
          const errorLower = result.error.toLowerCase();
          if (
            errorLower.includes("email not confirmed") ||
            errorLower.includes("unconfirmed") ||
            errorLower.includes("confirmation")
          ) {
            setUnconfirmedEmail(email);
            setError(
              "Please check your email and click the confirmation link to activate your account."
            );
          } else {
            setError(result.error || "Authentication failed");
          }
        }
        setLoading(false);
      }
    } catch (err) {
      // Check if this is a redirect error (which is expected for successful auth)
      if (err instanceof Error) {
        const errorMessage = err.message.toLowerCase();
        const errorName = err.name.toLowerCase();

        if (
          errorMessage.includes("next_redirect") ||
          errorMessage.includes("redirect") ||
          errorMessage.includes("navigation") ||
          errorName === "redirecterror" ||
          errorName === "navigationerror"
        ) {
          // This is a successful redirect, accept invitation if present
          if (inviteToken && mode === "signup") {
            try {
              // Wait a bit for the user to be fully created
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Get the newly created user ID
              const userResponse = await fetch('/api/auth/user');
              const userData = await userResponse.json();
              
              if (userData.user?.id) {
                const acceptResponse = await fetch('/api/team/accept-invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: inviteToken,
                    userId: userData.user.id
                  })
                });
                
                if (!acceptResponse.ok) {
                  const errorData = await acceptResponse.json();
                  console.error('Failed to accept invitation:', errorData);
                } else {
                  console.log('✅ Invitation accepted successfully');
                }
              }
            } catch (inviteError) {
              console.error('Error accepting invitation after redirect:', inviteError);
            }
          }
          
          // This is a successful redirect, don't show error
          console.log("Successful redirect detected, not showing error");
          return;
        }
      }

      // Only show error if it's not a redirect
      console.error("Auth error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!unconfirmedEmail || resendCooldown > 0) return;

    setResendLoading(true);
    try {
      const response = await fetch("/api/resend-confirmation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: unconfirmedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend confirmation");
      }

      // Set cooldown after successful resend
      setResendCooldown(60);
      localStorage.setItem("resendCooldown", "60");
      localStorage.setItem("resendTimestamp", Date.now().toString());

      setError(
        "Confirmation email sent! Please check your inbox and spam folder."
      );
    } catch (error) {
      console.error("Resend error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to resend confirmation email"
      );
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-6">
      {inviteInfo && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm text-blue-800 mb-1">
            <strong>You've been invited to join {inviteInfo.organizationName}</strong>
          </p>
          <p className="text-xs text-blue-600">
            Role: {inviteInfo.role} • Email: {inviteInfo.email}
          </p>
        </div>
      )}

      {mode === "signup" && (
        <div>
          <label
            htmlFor="firstName"
            className="block text-xs font-semibold text-gray-800 mb-2"
          >
            First Name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            className="mt-1 block w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-sm transition-all duration-200 focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-100 focus:shadow-lg"
            placeholder="Your first name"
          />
        </div>
      )}
      
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-semibold text-gray-800 mb-2"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          {...(mode === 'login' 
            ? {} // Uncontrolled for login - allows typing freely
            : inviteInfo 
              ? { value: inviteInfo.email, readOnly: true } // Readonly if invitation
              : {}
          )}
          className={`mt-1 block w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-sm transition-all duration-200 focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-100 focus:shadow-lg ${inviteInfo && mode === 'signup' ? 'bg-gray-50' : ''}`}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-semibold text-gray-800 mb-2"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
          className="mt-1 block w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 shadow-sm transition-all duration-200 focus:border-slate-500 focus:outline-none focus:ring-4 focus:ring-slate-100 focus:shadow-lg"
          placeholder="••••••••"
        />
        {mode === "signup" && (
          <p className="mt-1 text-sm text-gray-500">
            Must be at least 6 characters
          </p>
        )}
      </div>

      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-emerald-800">
              Account created! Check your email for confirmation link.
            </p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div className="flex-1 flex items-center justify-between">
              <p className="text-sm text-red-800">
                {error.toLowerCase().includes("check your email") ||
                error.toLowerCase().includes("not yet confirmed") ||
                error.toLowerCase().includes("confirmation")
                  ? mode === "login"
                    ? "Account not confirmed. Check your email for confirmation link."
                    : "Check your email for confirmation link."
                  : error.toLowerCase().includes("invalid login credentials") ||
                    error.toLowerCase().includes("unable to sign in")
                  ? "Invalid credentials. Please check your email and password."
                  : error.toLowerCase().includes("account already exists")
                  ? "Account exists. Check your email for confirmation link."
                  : error}
              </p>
              {unconfirmedEmail && mode === "login" && (
                <div className="flex items-center gap-2">
                  {resendCooldown > 0 ? (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500 font-mono">
                        Resend in {resendCooldown}s
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resendLoading}
                      className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50 flex items-center gap-1 transition-colors"
                    >
                      {resendLoading && <LoadingSpinner size="sm" />}
                      Didn't receive? Resend
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || (mode === "signup" && resendCooldown > 0)}
        className="w-full rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 px-6 py-3 font-semibold text-white hover:from-slate-700 hover:to-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-100 shadow-lg transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <LoadingSpinner size="sm" />}
        {loading
          ? "Loading..."
          : mode === "signup" && resendCooldown > 0
          ? `Create Account (${resendCooldown}s)`
          : mode === "login"
          ? "Sign In"
          : "Create Account"}
      </button>
    </form>
  );
}
