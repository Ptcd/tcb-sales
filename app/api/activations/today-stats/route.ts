import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Meetings scheduled today
    const { count: scheduled } = await supabase
      .from('activation_meetings')
      .select('*', { count: 'exact', head: true })
      .eq('activator_user_id', user.id)
      .gte('scheduled_start_at', today.toISOString())
      .lt('scheduled_start_at', tomorrow.toISOString());
    
    // Completed today
    const { count: completed } = await supabase
      .from('activation_meetings')
      .select('*', { count: 'exact', head: true })
      .eq('activator_user_id', user.id)
      .eq('status', 'completed')
      .gte('completed_at', today.toISOString())
      .lt('completed_at', tomorrow.toISOString());
    
    // Installs marked today
    const { count: installed } = await supabase
      .from('trial_pipeline')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_activator_id', user.id)
      .gte('calculator_installed_at', today.toISOString())
      .lt('calculator_installed_at', tomorrow.toISOString());
    
    // First leads received today (for trials this activator worked)
    const { count: firstLeads } = await supabase
      .from('trial_pipeline')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_activator_id', user.id)
      .gte('first_lead_received_at', today.toISOString())
      .lt('first_lead_received_at', tomorrow.toISOString());
    
    return NextResponse.json({
      success: true,
      stats: {
        scheduled: scheduled || 0,
        completed: completed || 0,
        installed: installed || 0,
        firstLeads: firstLeads || 0,
      },
    });
    
  } catch (error: any) {
    console.error("Error fetching today stats:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


