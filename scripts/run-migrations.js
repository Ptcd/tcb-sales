#!/usr/bin/env node

/**
 * Run all migrations on Supabase
 * This script executes the combined SQL migration file on Supabase
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase credentials in .env.local");
  console.error("   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function runMigrations() {
  console.log("🚀 Starting database migration...");
  console.log(`   Supabase URL: ${SUPABASE_URL}\n`);

  // Read the combined migration file
  const migrationPath = path.join(__dirname, "../all_migrations_combined.sql");
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  console.log(`📝 Read migration file (${sql.length} characters)`);

  // Split SQL into statements (by semicolons, but preserve DO blocks)
  // For large files, we'll execute in chunks
  const chunks = [];
  let currentChunk = "";
  let inDoBlock = false;
  let doBlockDepth = 0;

  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentChunk += line + "\n";

    // Track DO $$ blocks
    if (line.match(/DO\s+\$\$/i)) {
      inDoBlock = true;
      doBlockDepth = 1;
    } else if (inDoBlock && line.includes("$$")) {
      // Count $$ occurrences to track nested blocks
      const matches = line.match(/\$\$/g);
      if (matches) {
        doBlockDepth += matches.length - 1;
        if (doBlockDepth <= 0) {
          inDoBlock = false;
        }
      }
    }

    // If we hit a semicolon and we're not in a DO block, it's a statement boundary
    if (line.trim().endsWith(";") && !inDoBlock && currentChunk.trim().length > 100) {
      // Only chunk if we have substantial content (avoid tiny chunks)
      if (currentChunk.trim().length > 5000) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
    }
  }

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // If no chunks created (single large statement), use the whole SQL
  if (chunks.length === 0) {
    chunks.push(sql);
  }

  console.log(`   Split into ${chunks.length} chunks\n`);

  // Execute each chunk
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`📦 Executing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)...`);

    try {
      // Use Supabase REST API to execute SQL
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql_query: chunk }),
      });

      if (!response.ok) {
        // If exec_sql RPC doesn't exist, try direct PostgreSQL connection approach
        // For now, we'll use the Supabase Management API
        const errorText = await response.text();
        console.log(`   ⚠️  RPC method not available, trying alternative...`);
        
        // Alternative: Use Supabase's SQL execution via REST API
        // Note: Supabase doesn't expose a direct SQL execution endpoint
        // We need to use the Supabase CLI or SQL Editor
        console.log(`   ❌ Cannot execute SQL programmatically via REST API`);
        console.log(`   📋 Please run the SQL manually in Supabase SQL Editor:`);
        console.log(`      ${SUPABASE_URL.replace("https://", "https://supabase.com/dashboard/project/").split(".")[0]}/sql`);
        console.log(`\n   Or use Supabase CLI:`);
        console.log(`      supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.${SUPABASE_URL.split("//")[1].split(".")[0]}.supabase.co:5432/postgres"`);
        process.exit(1);
      }

      const result = await response.json();
      console.log(`   ✅ Chunk ${i + 1} executed successfully`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ Error executing chunk ${i + 1}:`, error.message);
      errorCount++;
      
      // If first chunk fails with RPC error, provide manual instructions
      if (i === 0 && error.message.includes("exec_sql")) {
        console.log(`\n   📋 Since RPC method is not available, please run the SQL manually:`);
        console.log(`   1. Go to: https://supabase.com/dashboard/project/${SUPABASE_URL.split("//")[1].split(".")[0]}/sql`);
        console.log(`   2. Copy the contents of: all_migrations_combined.sql`);
        console.log(`   3. Paste and run in the SQL Editor\n`);
        process.exit(1);
      }
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
}

runMigrations().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

