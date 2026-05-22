/**
 * Restore deactivated cards and assign all to "Father" profile.
 * npx tsx scripts/restore-cards-father-profile.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createAdminClient } from "../lib/supabase/admin";

const PROFILE_NAME = "Father";

async function main() {
  const supabase = createAdminClient();

  const { data: households, error: hErr } = await supabase
    .from("households")
    .select("id")
    .limit(1);
  if (hErr) throw hErr;
  const householdId = households?.[0]?.id;
  if (!householdId) {
    console.error("No household found. Open the app once to create one.");
    process.exit(1);
  }
  console.log("Household:", householdId);

  let profileId: string | null = null;
  const { error: profileProbe } = await supabase
    .from("card_profiles")
    .select("id")
    .limit(1);

  const profilesAvailable =
    !profileProbe && !profileProbe?.message?.includes("card_profiles");

  if (profilesAvailable) {
    let { data: profile, error: pErr } = await supabase
      .from("card_profiles")
      .select("id, name")
      .eq("household_id", householdId)
      .ilike("name", PROFILE_NAME)
      .maybeSingle();
    if (pErr) throw pErr;

    if (!profile) {
      const { data: created, error: cErr } = await supabase
        .from("card_profiles")
        .insert({ household_id: householdId, name: PROFILE_NAME })
        .select()
        .single();
      if (cErr) throw cErr;
      profile = created;
      console.log("Created profile:", profile.name, profile.id);
    } else {
      console.log("Using profile:", profile.name, profile.id);
    }
    profileId = profile.id;
  } else {
    console.warn(
      "card_profiles not set up yet — reactivating cards only.\n" +
        "Run supabase/restore-father-cards.sql in Supabase SQL Editor for Father profile."
    );
  }

  const { data: allCards, error: cardsErr } = await supabase
    .from("cards")
    .select("id, nickname, bank, last4, active")
    .eq("household_id", householdId)
    .order("nickname");
  if (cardsErr) throw cardsErr;

  console.log(`Found ${allCards?.length ?? 0} card(s) in DB:`);
  for (const c of allCards ?? []) {
    console.log(
      `  - ${c.nickname} (${c.bank} ****${c.last4}) active=${c.active} profile=${c.profile_id ?? "none"}`
    );
  }

  if (!allCards?.length) {
    console.log("No cards to restore.");
    return;
  }

  const patch: Record<string, unknown> = {
    active: true,
    updated_at: new Date().toISOString(),
  };
  if (profileId) patch.profile_id = profileId;

  const { data: updated, error: upErr } = await supabase
    .from("cards")
    .update(patch)
    .eq("household_id", householdId)
    .select("id, nickname, active");

  if (upErr) throw upErr;

  console.log(
    `\nRestored ${updated?.length ?? 0} card(s)` +
      (profileId ? ` with profile "${PROFILE_NAME}"` : "") +
      ":"
  );
  for (const c of updated ?? []) {
    console.log(`  ✓ ${c.nickname} (active=${c.active})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
