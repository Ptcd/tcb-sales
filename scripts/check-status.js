#!/usr/bin/env node

/**
 * Supabase Status Checker
 * Checks the status of your Supabase connection and database
 */

const { execSync } = require("child_process");
const fs = require("fs");
require("dotenv").config({ path: ".env.local" });

console.log("🔍 Checking Supabase status...\n");

// Check environment variables
function checkEnvironment() {
  console.log("📋 Environment Variables:");

  const envVars = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "GOOGLE_MAPS_API_KEY"];

  envVars.forEach((key) => {
    const value = process.env[key];
    if (value) {
      const displayValue = key.includes("KEY")
        ? `${value.substring(0, 20)}...`
        : value;
      console.log(`   ✅ ${key}: ${displayValue}`);
    } else {
      console.log(`   ❌ ${key}: Not set`);
    }
  });
  console.log("");
}

// Check Supabase connection
function checkConnection() {
  console.log("🔗 Supabase Connection:");

  try {
    const status = execSync("npx supabase status", {
      encoding: "utf8",
      stdio: "pipe",
    });

    console.log("   ✅ Connected to Supabase project");

    // Parse project info
    const lines = status.split("\n");
    const projectLine = lines.find((line) => line.includes("Project ID"));
    if (projectLine) {
      console.log(`   📋 ${projectLine.trim()}`);
    }
  } catch (error) {
    console.log("   ❌ Not connected to Supabase project");
    console.log("   💡 Run: npm run supabase:setup");
  }
  console.log("");
}

// Check migration files
function checkMigrations() {
  console.log("📦 Migration Files:");

  const migrationDir = "supabase/migrations";

  if (fs.existsSync(migrationDir)) {
    const files = fs
      .readdirSync(migrationDir)
      .filter((f) => f.endsWith(".sql"));

    if (files.length > 0) {
      console.log(`   ✅ Found ${files.length} migration file(s):`);
      files.forEach((file) => {
        console.log(`      - ${file}`);
      });
    } else {
      console.log("   ⚠️  No migration files found");
    }
  } else {
    console.log("   ❌ Migration directory not found");
  }
  console.log("");
}

// Check database types
function checkTypes() {
  console.log("🔧 TypeScript Types:");

  const typesFile = "lib/database.types.ts";

  if (fs.existsSync(typesFile)) {
    const stats = fs.statSync(typesFile);
    const size = Math.round(stats.size / 1024);
    console.log(`   ✅ Database types file exists (${size}KB)`);
    console.log(`   📅 Last modified: ${stats.mtime.toLocaleString()}`);
  } else {
    console.log("   ❌ Database types file not found");
    console.log("   💡 Run: npm run supabase:generate-types");
  }
  console.log("");
}

// Check application files
function checkApplication() {
  console.log("🚀 Application Files:");

  const requiredFiles = [
    "app/page.tsx",
    "app/login/page.tsx",
    "app/signup/page.tsx",
    "app/dashboard/page.tsx",
    "components/SearchForm.tsx",
    "components/ResultsTable.tsx",
    "app/api/search/route.ts",
  ];

  let missingFiles = 0;

  requiredFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      console.log(`   ✅ ${file}`);
    } else {
      console.log(`   ❌ ${file}`);
      missingFiles++;
    }
  });

  if (missingFiles === 0) {
    console.log("   🎉 All application files present");
  } else {
    console.log(`   ⚠️  ${missingFiles} file(s) missing`);
  }
  console.log("");
}

// Generate summary
function generateSummary() {
  console.log("📊 Summary:");
  console.log("   🎯 Ready to run: npm run dev");
  console.log("   🔗 Supabase: Check connection status above");
  console.log("   📦 Migrations: Check migration files above");
  console.log("   🚀 Application: Check application files above");
  console.log("");
  console.log("💡 Next steps:");
  console.log("   1. Ensure all environment variables are set");
  console.log("   2. Run migrations if not done: npm run supabase:migrate");
  console.log("   3. Start development: npm run dev");
  console.log("   4. Test at: http://localhost:3000");
}

// Main status check function
async function checkStatus() {
  try {
    checkEnvironment();
    checkConnection();
    checkMigrations();
    checkTypes();
    checkApplication();
    generateSummary();
  } catch (error) {
    console.error("❌ Status check failed:", error.message);
    process.exit(1);
  }
}

// Run status check
checkStatus();
