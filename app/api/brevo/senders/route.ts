import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_BASE_URL = "https://api.brevo.com/v3";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!BREVO_API_KEY) {
      return NextResponse.json(
        { error: "BREVO_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const res = await fetch(`${BREVO_BASE_URL}/senders`, {
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Brevo /senders failed", res.status, text);
      return NextResponse.json(
        { error: "Failed to fetch Brevo senders" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const senders = Array.isArray(data?.senders)
      ? data.senders.map((s: any) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          active: s.active,
        }))
      : [];

    return NextResponse.json({ senders });
  } catch (error: any) {
    console.error("Error fetching Brevo senders:", error);
    return NextResponse.json(
      { error: "Unexpected error fetching Brevo senders" },
      { status: 500 }
    );
  }
}

