/**
 * scripts/migrate-to-user.ts
 *
 * One-shot: take all existing cards/profiles/bills that don't belong to any
 * Supabase Auth user (so-called "orphan" households from the SKIP_AUTH=true
 * days) and assign them to the household of a single target user — the one
 * you just created in Supabase.
 *
 * Usage:
 *   npm run migrate:cards -- user@example.com
 *   # or set MIGRATE_TO_EMAIL in .env.local and run without args:
 *   npm run migrate:cards
 *
 * Safe to re-run: only moves data from households with zero household_members,
 * so once everyone is linked nothing further can be touched by accident.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  buildAdmin,
  ensureHouseholdForUser,
  findUserByEmail,
  migrateOrphansToHousehold,
} from "./_seed-helpers";

function resolveTargetEmail(): string {
  const fromArg = process.argv[2]?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.MIGRATE_TO_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  console.error(
    "✖ No target user. Pass the email as the first argument, e.g.:\n" +
      '    npm run migrate:cards -- you@example.com\n' +
      "  Or set MIGRATE_TO_EMAIL in .env.local."
  );
  process.exit(1);
}

async function main() {
  const targetEmail = resolveTargetEmail();
  const admin = buildAdmin();

  console.log("\nCC Bill Tracker — migrate cards to user");
  console.log("========================================");
  console.log(`Target user: ${targetEmail}`);

  const user = await findUserByEmail(admin, targetEmail);
  if (!user) {
    console.error(
      `\n✖ No Supabase Auth user found with email "${targetEmail}".\n` +
        "  Create the user first in Supabase → Authentication → Users → " +
        "Add user, then re-run this command."
    );
    process.exit(1);
  }
  console.log(`Auth user id: ${user.id}`);

  const householdId = await ensureHouseholdForUser(admin, user.id);
  console.log(`Household:    ${householdId}`);

  console.log("\nMigrating orphan data…");
  const result = await migrateOrphansToHousehold(admin, householdId);

  if (result.orphan_household_ids.length === 0) {
    console.log("  Nothing to migrate — no orphan households found.");
    console.log(
      "  (All existing data already belongs to a user.)\n"
    );
    return;
  }

  console.log(`  Cards moved:                       ${result.cards}`);
  console.log(`  Profiles moved:                    ${result.profiles}`);
  console.log(`  Empty orphan households removed:   ${result.households_removed}`);
  console.log("  Source households:");
  for (const id of result.orphan_household_ids) console.log(`    - ${id}`);
  console.log(
    `\nDone. Set SKIP_AUTH=false in .env.local and sign in as ${targetEmail} to verify.\n`
  );
}

main().catch((e) => {
  console.error("\n✖ Migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
