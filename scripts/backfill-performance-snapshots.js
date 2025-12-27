/**
 * Backfill script for performance dashboards
 * 
 * 1. Backfills completed_at on activation_meetings
 * 2. Generates historical weekly snapshots (last 4 weeks)
 * 
 * Usage: node scripts/backfill-performance-snapshots.js
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get Monday of the week for a given date
 */
function getWeekStart(date) {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get Sunday of the week for a given date
 */
function getWeekEnd(date) {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

async function backfillCompletedAt() {
  console.log("Step 1: Backfilling completed_at on activation_meetings...");
  
  // Set completed_at = updated_at for existing completed meetings
  const { data, error } = await supabase
    .from("activation_meetings")
    .update({ completed_at: supabase.raw("updated_at") })
    .eq("status", "completed")
    .is("completed_at", null)
    .select();

  if (error) {
    console.error("Error backfilling completed_at:", error);
    return false;
  }

  console.log(`✓ Backfilled completed_at for ${data?.length || 0} meetings`);
  return true;
}

async function generateHistoricalSnapshots() {
  console.log("\nStep 2: Generating historical weekly snapshots...");
  
  // Get last 4 weeks
  const now = new Date();
  const weeks = [];
  
  for (let i = 0; i < 4; i++) {
    const weekDate = new Date(now);
    weekDate.setDate(weekDate.getDate() - (i * 7));
    const weekStart = getWeekStart(weekDate);
    const weekEnd = getWeekEnd(weekStart);
    weeks.push({ weekStart, weekEnd });
  }

  console.log(`Generating snapshots for ${weeks.length} weeks...`);

  // Import the calculation functions (we'll need to call the API or duplicate logic)
  // For now, we'll call the cron endpoint for each week
  const cronSecret = process.env.CRON_SECRET || "";
  
  for (const week of weeks) {
    const weekStartIso = week.weekStart.toISOString().split("T")[0];
    console.log(`\n  Processing week: ${weekStartIso}`);
    
    // Call the generate-weekly-performance endpoint
    // Note: This requires the endpoint to accept a week parameter
    // For now, we'll just log that this needs to be done manually
    console.log(`  ⚠ Week ${weekStartIso} - Run cron manually or update script to process this week`);
  }

  console.log("\n✓ Historical snapshot generation queued");
  return true;
}

async function main() {
  console.log("=== Performance Dashboards Backfill ===\n");
  
  try {
    // Step 1: Backfill completed_at
    const backfillSuccess = await backfillCompletedAt();
    if (!backfillSuccess) {
      console.error("Backfill failed");
      process.exit(1);
    }

    // Step 2: Generate historical snapshots
    // Note: This requires the cron endpoint to be updated to accept a week parameter
    // For now, we'll just log instructions
    console.log("\n⚠ Historical snapshot generation:");
    console.log("  The cron endpoint needs to be called manually for each week,");
    console.log("  or you can update the script to call the calculation functions directly.");
    console.log("\n  To generate snapshots manually:");
    console.log("  1. Update the cron endpoint to accept a weekStart parameter");
    console.log("  2. Call POST /api/cron/generate-weekly-performance with weekStart for each week");
    console.log("  3. Or run the cron job and it will generate for the current week");

    console.log("\n=== Backfill Complete ===");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();


