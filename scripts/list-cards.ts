import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const s = createAdminClient();
  const { data, error } = await s
    .from("cards")
    .select("id,nickname,bank,last4,mobile,active")
    .order("nickname");
  console.log(JSON.stringify({ error: error?.message, cards: data }, null, 2));
}
main();
