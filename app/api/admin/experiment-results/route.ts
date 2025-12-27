import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Get experiment results
  const { data: trials } = await supabase
    .from("trial_pipeline")
    .select("followup_variant, trial_started_at, activated_at, first_login_at")
    .not("followup_variant", "is", null)
    .not("trial_started_at", "is", null);

  const results = {
    A: { total: 0, activated: 0, activated24h: 0, noHumanActivated: 0 },
    B: { total: 0, activated: 0, activated24h: 0, noHumanActivated: 0 },
  };

  (trials || []).forEach(t => {
    const variant = t.followup_variant as 'A' | 'B';
    if (!variant) return;
    
    results[variant].total++;
    
    if (t.activated_at) {
      results[variant].activated++;
      
      // Activated within 24h?
      const trialStart = new Date(t.trial_started_at).getTime();
      const activatedTime = new Date(t.activated_at).getTime();
      if (activatedTime - trialStart <= 24 * 60 * 60 * 1000) {
        results[variant].activated24h++;
      }
    }
  });

  // Calculate rates
  const formatVariant = (v: typeof results.A) => ({
    ...v,
    activationRate: v.total > 0 ? Math.round((v.activated / v.total) * 100) : 0,
    activation24hRate: v.total > 0 ? Math.round((v.activated24h / v.total) * 100) : 0,
  });

  return NextResponse.json({
    variantA: formatVariant(results.A),
    variantB: formatVariant(results.B),
    sampleSize: (trials || []).length,
    recommendation: results.A.total >= 20 && results.B.total >= 20 
      ? (formatVariant(results.B).activation24hRate > formatVariant(results.A).activation24hRate + 10
          ? "Variant B showing promise - continue monitoring"
          : "No significant difference yet - continue experiment")
      : "Need more data (minimum 20 per variant)",
  });
}


