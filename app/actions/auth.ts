"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  console.log("=== SIGNUP DEBUG START ===");
  
  let supabase;
  try {
    supabase = await createClient();
    console.log("✅ Supabase client created successfully");
  } catch (clientError) {
    console.error("❌ Failed to create Supabase client:", clientError);
    return { error: "Server configuration error. Please contact support." };
  }

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("firstName") as string | null;

  console.log("📧 Signup attempt for email:", email);
  console.log("👤 First name:", firstName || "(not provided)");

  const data = {
    email,
    password,
    options: {
      data: {
        first_name: firstName?.trim() || null,
      },
    },
  };

  console.log("🔄 Calling supabase.auth.signUp...");
  const { data: signUpData, error } = await supabase.auth.signUp(data);

  if (error) {
    console.error("❌ SIGNUP ERROR ❌");
    console.error("Error message:", error.message);
    console.error("Error status:", error.status);
    console.error("Error name:", error.name);
    console.error("Error code:", (error as any).code);
    console.error("Full error object:", JSON.stringify(error, null, 2));
    console.error("Error cause:", (error as any).cause);
    console.error("Error stack:", error.stack);
    
    // Log if this looks like an SMTP/email error
    if (error.message.toLowerCase().includes("email") || 
        error.message.toLowerCase().includes("smtp") ||
        error.message.toLowerCase().includes("send")) {
      console.error("🔴 THIS APPEARS TO BE AN EMAIL/SMTP ERROR");
      console.error("Check Supabase Dashboard -> Auth -> SMTP Settings");
    }

    // Check if user already exists but is unconfirmed
    if (error.message.toLowerCase().includes("user already registered")) {
      return {
        error:
          "An account with this email already exists. Please check your email for a confirmation link, or use the resend confirmation page if the link has expired.",
      };
    }

    // Check for database errors from trigger
    if (error.message.toLowerCase().includes("database") || error.message.toLowerCase().includes("saving new user")) {
      // If signing up with an invitation, provide specific guidance
      const signupUrl = error.message.toLowerCase().includes("invitation") || error.message.toLowerCase().includes("invite")
        ? " If you're signing up with an invitation link, try refreshing the page and signing up again."
        : "";
      
      return {
        error: "Database error: " + error.message + signupUrl + " If the problem persists, please contact support.",
      };
    }

    console.log("=== SIGNUP DEBUG END (with error) ===");
    return { error: error.message };
  }

  // Log successful signup
  console.log("✅ SIGNUP SUCCESSFUL");
  console.log("User ID:", signUpData.user?.id);
  console.log("User email:", signUpData.user?.email);
  console.log("Email confirmed:", signUpData.user?.email_confirmed_at ? "yes" : "no");
  console.log("Session:", signUpData.session ? "created" : "none (email confirmation required)");

  // Check if user was created but needs email confirmation
  if (signUpData.user && !signUpData.user.email_confirmed_at) {
    console.log("📧 Email confirmation required - user should receive confirmation email");
    console.log("=== SIGNUP DEBUG END (success, needs confirmation) ===");
    return {
      error:
        "Account created successfully! Please check your email and click the confirmation link to activate your account. If you don't see the email, check your spam folder.",
      success: true,
    };
  }

  // User was created and confirmed (shouldn't happen normally)
  console.log("=== SIGNUP DEBUG END (fully confirmed) ===");
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  console.log("Attempting sign in for user");
  const { data: signInData, error } = await supabase.auth.signInWithPassword(
    data
  );

  console.log("Sign in result:", {
    user: signInData?.user?.email_confirmed_at ? "confirmed" : "unconfirmed",
    error: error?.message,
  });

  if (error) {
    // Check if this is an email confirmation error
    const errorLower = error.message.toLowerCase();

    if (
      errorLower.includes("email not confirmed") ||
      errorLower.includes("email_confirmation") ||
      errorLower.includes("unconfirmed")
    ) {
      return {
        error:
          "Please check your email and click the confirmation link to activate your account. If you don't see the email, check your spam folder.",
      };
    }

    // For "Invalid login credentials", provide a more helpful message
    if (errorLower.includes("invalid login credentials")) {
      return {
        error:
          "Unable to sign in. Please check your email for a confirmation link if you just signed up, or verify your credentials. If you already confirmed your email, try signing in again.",
      };
    }

    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
