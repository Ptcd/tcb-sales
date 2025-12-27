#!/usr/bin/env node

/**
 * Supabase Setup Script
 * This script helps you connect to your remote Supabase project and run migrations
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

console.log("🚀 Setting up Supabase connection and migrations...\n");

// Check if environment variables are set
function checkEnvVars() {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nPlease add these to your .env.local file");
    process.exit(1);
  }

  console.log("✅ Environment variables found");
}

// Extract project ID from Supabase URL
function getProjectId() {
  const url = process.env.SUPABASE_URL;
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);

  if (!match) {
    console.error("❌ Invalid Supabase URL format");
    console.error("Expected: https://your-project-id.supabase.co");
    process.exit(1);
  }

  return match[1];
}

// Check if Supabase CLI is available
function checkSupabaseCLI() {
  try {
    execSync("npx supabase --version", { stdio: "pipe" });
    console.log("✅ Supabase CLI available via npx");
    return true;
  } catch (error) {
    console.error("❌ Supabase CLI not available");
    console.error("Installing via npx...");
    return false;
  }
}

// Check if user is logged in to Supabase
function checkSupabaseLogin() {
  try {
    execSync("npx supabase status", { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

// Link to remote project
function linkToProject(projectId) {
  console.log(`🔗 Linking to project: ${projectId}`);

  // Check if user is logged in
  if (!checkSupabaseLogin()) {
    console.log("🔐 You need to login to Supabase first...");
    console.log("Opening browser for authentication...");

    try {
      execSync("npx supabase login", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      console.log("✅ Successfully logged in to Supabase");
    } catch (error) {
      console.error("❌ Failed to login to Supabase");
      console.error("Please run: npx supabase login");
      console.error("Then run: npm run setup");
      process.exit(1);
    }
  }

  try {
    execSync(`npx supabase link --project-ref ${projectId}`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log("✅ Successfully linked to project");
  } catch (error) {
    console.error("❌ Failed to link to project");
    console.error("Make sure you have access to this Supabase project");
    process.exit(1);
  }
}

// Run migrations
function runMigrations() {
  console.log("📦 Running migrations...");

  try {
    execSync("npx supabase db push", {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed");
    console.error(
      "You can run migrations manually using the SQL in supabase/migrations/"
    );
    process.exit(1);
  }
}

// Generate TypeScript types
function generateTypes(projectId) {
  console.log("🔧 Generating TypeScript types...");

  try {
    execSync(
      `npx supabase gen types typescript --project-id ${projectId} > lib/database.types.ts`,
      {
        stdio: "inherit",
        cwd: process.cwd(),
      }
    );
    console.log("✅ TypeScript types generated");
  } catch (error) {
    console.warn("⚠️  Failed to generate types (optional)");
    console.warn("You can generate them manually later");
  }
}

// Main setup function
async function setup() {
  try {
    checkEnvVars();

    const projectId = getProjectId();
    console.log(`📋 Project ID: ${projectId}\n`);

    checkSupabaseCLI();

    linkToProject(projectId);

    runMigrations();

    generateTypes(projectId);

    console.log("\n🎉 Supabase setup completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Run: npm run dev");
    console.log("2. Visit: http://localhost:3000");
    console.log("3. Test the application");
  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
}

// Run setup
setup();
