import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/[id]
 * Get a single campaign with details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get members and leads count
    const [membersResult, leadsResult] = await Promise.all([
      supabase
        .from("campaign_members")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id),
      supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id),
    ]);

    return NextResponse.json({
      campaign: {
        ...campaign,
        member_count: membersResult.count || 0,
        lead_count: leadsResult.count || 0,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/campaigns/[id]
 * Update a campaign (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Verify campaign exists and belongs to organization
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, status, email_address, email_from_name, email_signature, lead_filters, capital_budget_usd, bonus_rules } = body;

    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Campaign name cannot be empty" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();

      // Check for duplicate name (excluding current campaign)
      const { data: duplicate } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("name", name.trim())
        .neq("id", id)
        .single();

      if (duplicate) {
        return NextResponse.json(
          { error: "A campaign with this name already exists" },
          { status: 409 }
        );
      }
    }
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      if (!["active", "paused", "archived"].includes(status)) {
        return NextResponse.json(
          { error: "Invalid status. Must be active, paused, or archived" },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    // Email settings (optional)
    if (email_address !== undefined) {
      const trimmed = email_address ? String(email_address).trim() : "";
      if (trimmed && !trimmed.includes("@")) {
        return NextResponse.json(
          { error: "Invalid sender email" },
          { status: 400 }
        );
      }
      updateData.email_address = trimmed || null;
    }
    if (email_from_name !== undefined) {
      const trimmed = email_from_name ? String(email_from_name).trim() : "";
      updateData.email_from_name = trimmed || null;
    }
    if (email_signature !== undefined) {
      updateData.email_signature = email_signature || null;
    }

    // Capital budget (governance)
    if (capital_budget_usd !== undefined) {
      if (capital_budget_usd === null || capital_budget_usd === "") {
        updateData.capital_budget_usd = null;
      } else {
        const budget = Number(capital_budget_usd);
        if (isNaN(budget) || budget < 0) {
          return NextResponse.json(
            { error: "Capital budget must be a non-negative number" },
            { status: 400 }
          );
        }
        updateData.capital_budget_usd = budget;
      }
    }

    // Lead filters (optional)
    if (lead_filters !== undefined) {
      if (lead_filters === null) {
        updateData.lead_filters = {};
      } else if (typeof lead_filters !== "object" || Array.isArray(lead_filters)) {
        return NextResponse.json(
          { error: "lead_filters must be an object" },
          { status: 400 }
        );
      } else {
        // Validate and sanitize filter fields
        const validFilters: any = {};
        if (lead_filters.require_website !== undefined) {
          validFilters.require_website = !!lead_filters.require_website;
        }
        if (lead_filters.require_phone !== undefined) {
          validFilters.require_phone = !!lead_filters.require_phone;
        }
        if (lead_filters.require_email !== undefined) {
          validFilters.require_email = !!lead_filters.require_email;
        }
        if (lead_filters.min_rating !== undefined) {
          const rating = Number(lead_filters.min_rating);
          if (isNaN(rating) || rating < 0 || rating > 5) {
            return NextResponse.json(
              { error: "min_rating must be a number between 0 and 5" },
              { status: 400 }
            );
          }
          validFilters.min_rating = rating;
        }
        if (lead_filters.min_reviews !== undefined) {
          const reviews = Number(lead_filters.min_reviews);
          if (isNaN(reviews) || reviews < 0) {
            return NextResponse.json(
              { error: "min_reviews must be a non-negative number" },
              { status: 400 }
            );
          }
          validFilters.min_reviews = reviews;
        }
        updateData.lead_filters = validFilters;
      }
    }

    // Bonus rules (governance)
    if (bonus_rules !== undefined) {
      if (bonus_rules === null) {
        updateData.bonus_rules = [];
      } else if (!Array.isArray(bonus_rules)) {
        return NextResponse.json({ error: "bonus_rules must be an array" }, { status: 400 });
      } else {
        for (const rule of bonus_rules) {
          if (!rule.trigger) {
            return NextResponse.json({ error: "Each bonus rule must have a trigger" }, { status: 400 });
          }
        }
        updateData.bonus_rules = bonus_rules;
      }
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating campaign:", error);
      return NextResponse.json(
        { error: "Failed to update campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error("Error in PUT /api/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign (admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Verify campaign exists and belongs to organization
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Prevent deletion of default campaign
    if (existing.name === "Default Campaign") {
      return NextResponse.json(
        { error: "Cannot delete the default campaign" },
        { status: 400 }
      );
    }

    // Delete campaign (cascade will handle members and leads)
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting campaign:", error);
      return NextResponse.json(
        { error: "Failed to delete campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Campaign deleted successfully" });
  } catch (error: any) {
    console.error("Error in DELETE /api/campaigns/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

