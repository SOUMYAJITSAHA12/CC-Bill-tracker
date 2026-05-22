/**
 * scripts/_seed-helpers.ts
 *
 * Shared Supabase admin helpers used by both `seed-users.ts` (bootstrap two
 * static accounts) and `migrate-to-user.ts` (move existing data into one
 * user's household). Not exported as part of the app runtime — strictly a
 * dev/ops module.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "../lib/supabase/tls-dev";

export type Admin = SupabaseClient;

/**
 * Build a Supabase client backed by the service-role key.
 * Bails with a friendly error if the key is missing — these scripts cannot
 * use the anon key because they call `auth.admin.*` and update RLS-protected
 * tables across households.
 */
export function buildAdmin(): Admin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "✖ This script needs SUPABASE_SERVICE_ROLE_KEY (not just the anon key) " +
        "because it touches Supabase Auth and writes across households."
    );
    console.error(
      "  Find it in Supabase → Project Settings → API → service_role. " +
        "Paste it into .env.local as SUPABASE_SERVICE_ROLE_KEY=eyJ…"
    );
    process.exit(1);
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Find a Supabase Auth user by email (case-insensitive). Returns null if not
 * found. Supabase's admin API has no direct email-filter, so we paginate
 * listUsers — perPage 200 is plenty for a personal app.
 */
export async function findUserByEmail(
  admin: Admin,
  email: string
): Promise<{ id: string; email?: string } | null> {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (let p = 0; p < 20; p++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return { id: found.id, email: found.email ?? undefined };
    if (data.users.length < 200) break;
    page++;
  }
  return null;
}

/**
 * Create (or update the password of) a user via the admin API.
 * Idempotent — re-running with the same email is safe; existing users get
 * their password and email_confirmed flag refreshed.
 */
export async function ensureUser(
  admin: Admin,
  def: { email: string; password: string }
): Promise<{ user_id: string; created: boolean }> {
  const { data, error } = await admin.auth.admin.createUser({
    email: def.email,
    password: def.password,
    email_confirm: true,
  });

  if (data?.user) return { user_id: data.user.id, created: true };

  const existing = await findUserByEmail(admin, def.email);
  if (existing) {
    const { error: updErr } = await admin.auth.admin.updateUserById(
      existing.id,
      { password: def.password, email_confirm: true }
    );
    if (updErr) throw updErr;
    return { user_id: existing.id, created: false };
  }

  throw error ?? new Error(`Failed to create or find user ${def.email}`);
}

/**
 * Return the user's existing household_id, or create a new household + member
 * row and return that. Pairs with `ensureUser`.
 */
export async function ensureHouseholdForUser(
  admin: Admin,
  userId: string,
  householdName = "Credit Cards"
): Promise<string> {
  const { data: existing, error: memErr } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (existing?.household_id) return existing.household_id as string;

  const { data: hh, error: hhErr } = await admin
    .from("households")
    .insert({ name: householdName })
    .select("id")
    .single();
  if (hhErr || !hh) throw hhErr ?? new Error("Failed to create household");

  const { error: insErr } = await admin.from("household_members").insert({
    household_id: hh.id,
    user_id: userId,
    role: "admin",
  });
  if (insErr) throw insErr;

  return hh.id as string;
}

/**
 * "Orphan" = household that exists but has no `household_members` row,
 * typically the default household created while SKIP_AUTH=true was on.
 */
export async function findOrphanHouseholds(admin: Admin): Promise<string[]> {
  const { data: households, error: hErr } = await admin
    .from("households")
    .select("id");
  if (hErr) throw hErr;
  const { data: members, error: mErr } = await admin
    .from("household_members")
    .select("household_id");
  if (mErr) throw mErr;

  const membered = new Set(
    (members ?? []).map((m) => m.household_id as string)
  );
  return (households ?? [])
    .map((h) => h.id as string)
    .filter((id) => !membered.has(id));
}

export type MigrationResult = {
  cards: number;
  profiles: number;
  households_removed: number;
  orphan_household_ids: string[];
};

/**
 * Move all cards/profiles in orphan households into `targetHouseholdId`,
 * resolving profile-name collisions by appending " (2)", " (3)", etc.
 * Bills follow their card (bills.card_id), so they don't need separate moves.
 * Empty source households are deleted afterwards.
 */
export async function migrateOrphansToHousehold(
  admin: Admin,
  targetHouseholdId: string
): Promise<MigrationResult> {
  const orphans = (await findOrphanHouseholds(admin)).filter(
    (id) => id !== targetHouseholdId
  );

  if (orphans.length === 0) {
    return {
      cards: 0,
      profiles: 0,
      households_removed: 0,
      orphan_household_ids: [],
    };
  }

  const { data: orphanProfiles, error: opErr } = await admin
    .from("card_profiles")
    .select("id, name, household_id")
    .in("household_id", orphans);
  if (opErr) throw opErr;

  const { data: existingProfiles, error: epErr } = await admin
    .from("card_profiles")
    .select("name")
    .eq("household_id", targetHouseholdId);
  if (epErr) throw epErr;

  const takenNames = new Set(
    (existingProfiles ?? []).map((p) => (p.name as string).toLowerCase())
  );

  let profilesMoved = 0;
  for (const p of orphanProfiles ?? []) {
    const original = p.name as string;
    let candidate = original;
    let suffix = 2;
    while (takenNames.has(candidate.toLowerCase())) {
      candidate = `${original} (${suffix++})`;
    }
    takenNames.add(candidate.toLowerCase());

    const { error: updErr } = await admin
      .from("card_profiles")
      .update({
        household_id: targetHouseholdId,
        name: candidate,
      })
      .eq("id", p.id);
    if (updErr) {
      console.warn(
        `  ⚠ Could not move profile "${original}" (${p.id}): ${updErr.message}`
      );
      continue;
    }
    profilesMoved++;
  }

  const { data: movedCards, error: cardErr } = await admin
    .from("cards")
    .update({ household_id: targetHouseholdId })
    .in("household_id", orphans)
    .select("id");
  if (cardErr) throw cardErr;

  let removed = 0;
  for (const id of orphans) {
    const [{ count: cardCount }, { count: profileCount }] = await Promise.all([
      admin
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("household_id", id),
      admin
        .from("card_profiles")
        .select("id", { count: "exact", head: true })
        .eq("household_id", id),
    ]);
    if ((cardCount ?? 0) === 0 && (profileCount ?? 0) === 0) {
      const { error: delErr } = await admin
        .from("households")
        .delete()
        .eq("id", id);
      if (!delErr) removed++;
    }
  }

  return {
    cards: movedCards?.length ?? 0,
    profiles: profilesMoved,
    households_removed: removed,
    orphan_household_ids: orphans,
  };
}
