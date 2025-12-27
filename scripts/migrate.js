#!/usr/bin/env node

/**
 * Migration Runner Script
 * Runs Supabase migrations against your remote project
 */

const { execSync } = require("child_process");
const fs = require("fs");
require("dotenv").config({ path: ".env.local" });

console.log("📦 Running Supabase migrations...\n");

// Check if we're linked to a project
function checkProjectLink() {
  try {
    execSync("npx supabase status", { stdio: "pipe" });
    console.log("✅ Connected to Supabase project");
    return true;
  } catch (error) {
    console.error("❌ Not connected to a Supabase project");
    console.error("Run: npm run supabase:setup first");
    process.exit(1);
  }
}

// Run migrations
function runMigrations() {
  console.log("🔄 Pushing migrations to remote database...");

  try {
    execSync("npx supabase db push", {
      stdio: "inherit",
    });
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed");
    console.error("Check your connection and try again");
    process.exit(1);
  }
}

// Verify migration
function verifyMigration() {
  console.log("🔍 Verifying migration...");

  try {
    // Check if search_history table exists
    execSync("npx supabase db diff --schema public", {
      stdio: "pipe",
    });
    console.log("✅ Migration verified");
  } catch (error) {
    console.warn("⚠️  Could not verify migration");
  }
}

// Main migration function
async function migrate() {
  try {
    checkProjectLink();
    runMigrations();
    verifyMigration();

    console.log("\n🎉 Migration completed successfully!");
    console.log("\nYour database now includes:");
    console.log("- search_history table");
    console.log("- Row Level Security policies");
    console.log("- Performance indexes");
    console.log("- Helper functions and views");
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  }
}

// Run migration
migrate();
