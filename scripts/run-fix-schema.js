#!/usr/bin/env node

/**
 * Run the fix-missing-schema.sql against Supabase
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

async function runFix() {
  console.log("🔧 Running schema fix...\n");

  // Get database URL from Supabase URL
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.error("❌ SUPABASE_URL not found");
    process.exit(1);
  }

  // Extract project ref from URL (e.g., eexnssbtnnojlbqelava from https://eexnssbtnnojlbqelava.supabase.co)
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) {
    console.error("❌ Could not extract project ref from SUPABASE_URL");
    process.exit(1);
  }

  const projectRef = match[1];
  console.log("Project ref:", projectRef);

  // For direct database connection, we need the database password
  // This is typically set during project creation
  // We'll use the service role key to connect via Supabase's REST API instead

  const { createClient } = require("@supabase/supabase-js");

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY not found");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Read the SQL file
  const sqlPath = path.join(__dirname, "fix-missing-schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log("📄 SQL file loaded\n");
  console.log("⚠️  Supabase JS client cannot run raw SQL directly.");
  console.log("\n📋 Please run this SQL in Supabase SQL Editor:");
  console.log("   https://supabase.com/dashboard/project/" + projectRef + "/sql\n");
  console.log("--- COPY BELOW THIS LINE ---\n");
  console.log(sql);
  console.log("\n--- COPY ABOVE THIS LINE ---\n");
}

runFix().catch(console.error);

