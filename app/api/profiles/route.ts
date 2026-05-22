import { NextResponse } from "next/server";
import { getAppSupabase } from "@/lib/db";
import { getHouseholdId, isAuthSkipped, ensureHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

async function resolveHouseholdId(): Promise<string> {
  if (isAuthSkipped()) return await getHouseholdId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return ensureHousehold(user.id);
}

export async function GET() {
  try {
    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();
    const { data, error } = await supabase
      .from("card_profiles")
      .select("*")
      .eq("household_id", householdId)
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profiles: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Profile name required" }, { status: 400 });
    }

    const supabase = await getAppSupabase();
    const householdId = await resolveHouseholdId();
    const { data, error } = await supabase
      .from("card_profiles")
      .insert({ household_id: householdId, name })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Profile name already exists" },
          { status: 409 }
        );
      }
      if (error.code === "42501") {
        return NextResponse.json(
          {
            error:
              'RLS blocked profile create. Run supabase/fix-rls-card-profiles.sql in Supabase SQL Editor, or add SUPABASE_SERVICE_ROLE_KEY to .env.local',
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ profile: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
