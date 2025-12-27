import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/products
 * List all products
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name");
  
  if (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

/**
 * POST /api/governance/products
 * Create product (admin only)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Check admin role
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  
  const body = await request.json();
  
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  
  const { data, error } = await supabase
    .from("products")
    .insert({ 
      name: body.name, 
      active: body.active ?? true 
    })
    .select()
    .single();
  
  if (error) {
    console.error("Error creating product:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data, { status: 201 });
}


