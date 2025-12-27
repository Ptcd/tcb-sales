"use client";

import { useState, useEffect } from "react";
import { X, Rocket, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

interface StartTrialModalProps {
  leadId: string;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  leadWebsite?: string;
  onClose: () => void;
  onSuccess?: (result: TrialProvisionResult) => void;
}

interface TrialProvisionResult {
  success: boolean;
  userId?: string;
  email?: string;
  credits?: number;
  loginUrl?: string;
  alreadyExists?: boolean;
  error?: string;
}

export function StartTrialModal({
  leadId,
  leadName,
  leadEmail,
  leadPhone,
  leadWebsite,
  onClose,
  onSuccess,
}: StartTrialModalProps) {
  const [businessName, setBusinessName] = useState(leadName || "");
  const [contactName, setContactName] = useState("");  // Optional - rep fills if they get it on the call
  const [email, setEmail] = useState(leadEmail || "");
  const [phone, setPhone] = useState(leadPhone || "");  // Always autofill - they're on the phone
  const [website, setWebsite] = useState(leadWebsite || "");  // Autofill if available from lead data
  const [primingConfirmed, setPrimingConfirmed] = useState(false);  // Required checkbox
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TrialProvisionResult | null>(null);

  // Email validation
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const canSubmit = email.trim() && businessName.trim() && isValidEmail(email) && website.trim() && primingConfirmed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit) {
      toast.error("Please fill in required fields with valid data");
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/trials/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          businessName: businessName.trim(),
          contactName: contactName.trim() || undefined,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          source: "cold_call",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to provision trial");
      }

      setResult(data);
      
      if (data.alreadyExists) {
        toast.success("Account already exists - lead updated", { icon: "ℹ️" });
      } else {
        toast.success("Trial started! Welcome email sent to prospect.");
      }

      onSuccess?.(data);
    } catch (error: any) {
      console.error("Error provisioning trial:", error);
      setResult({ success: false, error: error.message });
      toast.error(error.message || "Failed to start trial");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (result?.success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Success Header */}
          <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8" />
              <div>
                <h2 className="text-xl font-bold">
                  {result.alreadyExists ? "Account Found" : "Trial Started!"}
                </h2>
                <p className="text-green-100 text-sm">
                  {result.alreadyExists 
                    ? "This prospect already has an account" 
                    : "20 credits added • Welcome email sent"}
                </p>
              </div>
            </div>
          </div>

          {/* Success Content */}
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Email</span>
                <span className="font-medium text-gray-900">{result.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Credits</span>
                <span className="font-medium text-gray-900">{result.credits || 20}</span>
              </div>
              {result.loginUrl && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Login URL</span>
                  <a 
                    href={result.loginUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline truncate max-w-[200px]"
                  >
                    {result.loginUrl.replace("https://", "")}
                  </a>
                </div>
              )}
            </div>

            {!result.alreadyExists && (
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="font-medium text-blue-800 mb-1">Next Steps:</p>
                <ul className="list-disc list-inside text-blue-700 space-y-1">
                  <li>Prospect will receive a welcome email</li>
                  <li>They can set their password via the link</li>
                  <li>Lead status updated to "Trial Started"</li>
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Rocket className="h-6 w-6" />
              <div>
                <h2 className="text-xl font-bold">Start Free Trial</h2>
                <p className="text-blue-100 text-sm">20 credits • Junk Car Calculator</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
              disabled={isSubmitting}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Banner */}
          {result?.error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{result.error}</span>
            </div>
          )}

          {/* Business Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Joe's Auto Salvage"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Contact Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Joe Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting}
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joe@joesauto.com"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                email && !isValidEmail(email) 
                  ? "border-red-300 bg-red-50" 
                  : "border-gray-300"
              }`}
              disabled={isSubmitting}
              required
            />
            {email && !isValidEmail(email) && (
              <p className="text-xs text-red-600 mt-1">Please enter a valid email address</p>
            )}
          </div>

          {/* Priming Checkbox - Required */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={primingConfirmed}
                onChange={(e) => setPrimingConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                disabled={isSubmitting}
              />
              <div className="text-sm">
                <span className="font-medium text-gray-900">I told the prospect:</span>
                <p className="text-gray-700 mt-1 italic">
                  "When you get the email, the first thing you'll want to do is set your pricing — that's what actually turns it on."
                </p>
              </div>
            </label>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting}
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Where the calculator will be installed
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Create Trial
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

