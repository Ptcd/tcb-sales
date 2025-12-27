import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    
    // Get all calls with direction = inbound
    const { data: calls, error } = await supabase
      .from("calls")
      .select("*")
      .eq("direction", "inbound")
      .order("initiated_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching debug voicemails:", error);
      return NextResponse.json({ error: "Failed to fetch calls" }, { status: 500 });
    }

    return NextResponse.json({ 
      calls,
      count: calls?.length || 0 
    });
  } catch (error) {
    console.error("Error in debug voicemails API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

