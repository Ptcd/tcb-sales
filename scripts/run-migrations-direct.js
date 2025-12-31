#!/usr/bin/env node

/**
 * Direct Migration Runner
 * Executes all_migrations_combined.sql directly against Supabase using service role key
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

async function runMigrations() {
  console.log("📦 Running Supabase migrations directly...\n");

  // Check environment variables
  if (!process.env.SUPABASE_URL) {
    console.error("❌ SUPABASE_URL not found in environment");
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY not found in environment");
    process.exit(1);
  }

  // Read the combined SQL file
  const sqlPath = path.join(__dirname, "..", "all_migrations_combined.sql");
  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ SQL file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`📄 Loaded SQL file (${sql.split("\n").length} lines)\n`);

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  console.log("🔄 Executing migrations...\n");

  try {
    // Split SQL by semicolons and execute in chunks
    // Note: Supabase REST API has limitations, so we'll use RPC if available
    // For now, we'll need to use the SQL Editor or direct PostgreSQL connection
    
    // Unfortunately, Supabase JS client doesn't support raw SQL execution
    // We need to use the Supabase SQL Editor or PostgreSQL client
    
    console.log("⚠️  Supabase JS client doesn't support raw SQL execution");
    console.log("\n📋 Please run the migrations using one of these methods:\n");
    console.log("1. Supabase SQL Editor:");
    console.log("   - Go to: https://supabase.com/dashboard/project/eexnssbtnnojlbqelava/sql");
    console.log("   - Copy contents of all_migrations_combined.sql");
    console.log("   - Paste and run in SQL Editor\n");
    console.log("2. PostgreSQL client (psql):");
    console.log("   - Install PostgreSQL client tools");
    console.log("   - Run: psql <connection-string> < all_migrations_combined.sql\n");
    console.log("3. Supabase CLI:");
    console.log("   - Run: npx supabase db push\n");
    
    process.exit(1);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigrations();

