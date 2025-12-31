#!/usr/bin/env node

/**
 * Verify Database Tables
 * Checks if required tables exist in Supabase
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

async function verifyTables() {
  console.log("🔍 Verifying database tables...\n");

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

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

  const requiredTables = [
    "organizations",
    "user_profiles",
    "search_results",
    "search_history",
    "calls",
    "campaigns",
  ];

  console.log("Checking for required tables:\n");

  for (const table of requiredTables) {
    try {
      // Try to query the table (limit 0 to just check if it exists)
      const { error } = await supabase.from(table).select("*").limit(0);

      if (error) {
        if (error.code === "42P01") {
          // Table does not exist
          console.log(`❌ ${table} - NOT FOUND`);
        } else {
          console.log(`⚠️  ${table} - Error: ${error.message}`);
        }
      } else {
        console.log(`✅ ${table} - EXISTS`);
      }
    } catch (err) {
      console.log(`❌ ${table} - Error: ${err.message}`);
    }
  }

  console.log("\n✅ Verification complete");
}

verifyTables().catch(console.error);

