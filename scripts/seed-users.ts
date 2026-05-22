/**
 * scripts/seed-users.ts
 *
 * One-shot setup script for the two static accounts that share this CC Bill
 * Tracker installation.
 *
 * What it does:
 *   1. Creates (or updates the password of) the two users defined by env vars:
 *        STATIC_USER_1_EMAIL / STATIC_USER_1_PASSWORD
 *        STATIC_USER_2_EMAIL / STATIC_USER_2_PASSWORD
 *      Both are created with email_confirm=true so they can sign in immediately.
 *   2. Ensures each user has its own household (creates household + members
 *      row if missing).
 *   3. Optionally migrates "orphan" data (cards/profiles in households with
 *      no household_members) into the household of MIGRATE_TO_EMAIL.
 *
 * Idempotent: re-running it does not duplicate users, households, or data.
 *
 * Run with:
 *   npm run seed:users
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  buildAdmin,
  ensureHouseholdForUser,
  ensureUser,
  migrateOrphansToHousehold,
} from "./_seed-helpers";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`✖ Missing required env var: ${name}`);
    console.error("  Add it to .env.local then re-run `npm run seed:users`.");
    process.exit(1);
  }
  return v.trim();
}

async function main() {
  const user1 = {
    email: requireEnv("STATIC_USER_1_EMAIL"),
    password: requireEnv("STATIC_USER_1_PASSWORD"),
  };
  const user2 = {
    email: requireEnv("STATIC_USER_2_EMAIL"),
    password: requireEnv("STATIC_USER_2_PASSWORD"),
  };
  const migrateToRaw = process.env.MIGRATE_TO_EMAIL?.trim().toLowerCase();

  console.log("\nSupabase user seeding\n=====================");
  const admin = buildAdmin();

  const r1 = await ensureUser(admin, user1);
  console.log(
    `  ${user1.email.padEnd(40)} ${r1.created ? "created" : "already existed (password reset)"}`
  );

  const r2 = await ensureUser(admin, user2);
  console.log(
    `  ${user2.email.padEnd(40)} ${r2.created ? "created" : "already existed (password reset)"}`
  );

  const h1 = await ensureHouseholdForUser(admin, r1.user_id);
  const h2 = await ensureHouseholdForUser(admin, r2.user_id);
  console.log("\nHouseholds");
  console.log(`  ${user1.email}  →  ${h1}`);
  console.log(`  ${user2.email}  →  ${h2}`);

  if (!migrateToRaw) {
    console.log(
      "\nMIGRATE_TO_EMAIL not set — skipping orphan data migration."
    );
    console.log(
      "  Tip: run `npm run migrate:cards -- <email>` later to claim existing " +
        "cards/bills into a user's household."
    );
    return;
  }

  const target =
    migrateToRaw === user1.email.toLowerCase()
      ? { email: user1.email, householdId: h1 }
      : migrateToRaw === user2.email.toLowerCase()
        ? { email: user2.email, householdId: h2 }
        : null;
  if (!target) {
    console.error(
      `\n✖ MIGRATE_TO_EMAIL="${migrateToRaw}" doesn't match either static user.`
    );
    console.error(
      `  Set it to either "${user1.email}" or "${user2.email}".`
    );
    process.exit(1);
  }

  console.log(
    `\nMigrating orphan data → ${target.email} (household ${target.householdId})`
  );
  const result = await migrateOrphansToHousehold(admin, target.householdId);
  console.log(`  Cards moved:                       ${result.cards}`);
  console.log(`  Profiles moved:                    ${result.profiles}`);
  console.log(`  Empty orphan households removed:   ${result.households_removed}`);
  if (result.orphan_household_ids.length > 0) {
    console.log("  Source households:");
    for (const id of result.orphan_household_ids) console.log(`    - ${id}`);
  }
  console.log("\nDone. Sign in at /login to verify.");
}

main().catch((e) => {
  console.error("\n✖ Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
