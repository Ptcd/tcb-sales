#!/usr/bin/env node

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
  const { data: summaries, error } = await supabase
    .from("weekly_sdr_summaries")
    .select("*")
    .eq("week_start", "2025-12-15")
    .eq("week_end", "2025-12-19");

  if (error) {
    console.error("Error:", error);
    return;
  }

  // Get SDR names
  const sdrIds = summaries.map(s => s.sdr_user_id);
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name, email")
    .in("id", sdrIds);

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  console.log("✅ Weekly Summaries for Dec 15-19:\n");
  summaries.forEach(s => {
    const profile = profileMap.get(s.sdr_user_id);
    const name = profile?.full_name || profile?.email || "Unknown";
    console.log(`  ${name}:`);
    console.log(`    Paid Hours: ${s.paid_hours}h`);
    console.log(`    Trials: ${s.trials_started}`);
    console.log(`    Dials: ${s.total_dials}`);
    console.log();
  });
}

verify();

