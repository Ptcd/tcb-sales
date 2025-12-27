import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/team/invitations
 * Get all invitations for the organization
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      console.error("[Invitations API] User profile missing organization_id for user:", user.id);
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    console.log(`[Invitations API] Fetching invitations for org: ${profile.organization_id}, user: ${user.email}`);

    // Get invitations with inviter name
    // Optionally filter by status (default to 'pending' if status query param provided)
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    
    if (statusFilter) {
      console.log(`[Invitations API] Filtering by status: ${statusFilter}`);
    }

    // Fetch invitations (invited_by references auth.users, not user_profiles, so we can't use FK join)
    let query = supabase
      .from("team_invitations")
      .select(`
        id,
        email,
        role,
        status,
        invited_by,
        expires_at,
        created_at
      `)
      .eq("organization_id", profile.organization_id);

    // Filter by status if provided (e.g., ?status=pending)
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: invitations, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching invitations:", error);
      return NextResponse.json(
        { error: "Failed to fetch invitations" },
        { status: 500 }
      );
    }

    // Auto-accept pending invitations for users who have already signed up
    // Uses database function that has access to auth.users table
    const pendingInvitations = (invitations || []).filter(
      (inv: any) => inv.status === "pending" && inv.email
    );

    for (const invitation of pendingInvitations) {
      try {
        // Call database function to auto-accept if user exists
        const { data: result, error: rpcError } = await supabase
          .rpc('auto_accept_user_invitation', { user_email_param: invitation.email });
        
        if (!rpcError && result && result.length > 0 && result[0].success) {
          invitation.status = "accepted";
          console.log(`[Invitations API] Auto-accepted invitation for ${invitation.email}: ${result[0].message}`);
        }
      } catch (err) {
        // Silently continue if function doesn't exist or fails
        console.log(`[Invitations API] Could not auto-accept for ${invitation.email}:`, err);
      }
    }

    // Log invitations for debugging
    console.log(`[Invitations API] Found ${invitations?.length || 0} invitations for org ${profile.organization_id}`);
    if (invitations && invitations.length > 0) {
      console.log("[Invitations API] Invitations:", invitations.map((inv: any) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
        expires_at: inv.expires_at,
        organization_id: inv.organization_id
      })));
      const pendingCount = invitations.filter((inv: any) => inv.status === 'pending').length;
      console.log(`[Invitations API] Pending invitations: ${pendingCount}`);
    } else {
      console.log("[Invitations API] No invitations found. This could mean:");
      console.log("  - No invitations have been created for this organization");
      console.log("  - RLS policies might be blocking the query");
      console.log("  - Invitations exist but belong to a different organization");
    }

    // Fetch inviter names from user_profiles
    const inviterIds = [...new Set((invitations || []).map((inv: any) => inv.invited_by).filter(Boolean))];
    let inviterNames: Record<string, string | null> = {};
    
    if (inviterIds.length > 0) {
      const { data: inviterProfiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", inviterIds);
      
      if (inviterProfiles) {
        inviterNames = inviterProfiles.reduce((acc: Record<string, string | null>, profile: any) => {
          acc[profile.id] = profile.full_name || null;
          return acc;
        }, {});
      }
    }

    // Transform to include inviter name
    const transformedInvitations = (invitations || []).map((inv: any) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invited_by: inv.invited_by,
      invitedByName: inv.invited_by ? (inviterNames[inv.invited_by] || null) : null,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    }));

    return NextResponse.json({
      success: true,
      invitations: transformedInvitations,
    });
  } catch (error) {
    console.error("Error in GET /api/team/invitations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
