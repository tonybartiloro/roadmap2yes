/**
 * `npm run bootstrap`: the same create-only function the login runs (plan §4.2), by hand, for local
 * and staging. Reads the environment (and `.env.local` if present). Prints ONLY the outcome: never
 * an email, a code or a key. Exit code 1 on a configuration error or a failure.
 */
import { createClient } from "@supabase/supabase-js";
import { ensureBootstrapUser, supabaseTarget } from "@/features/auth/bootstrap";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the variables come from the shell
}

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]?.trim();
const secretKey = process.env["SUPABASE_SECRET_KEY"]?.trim();
if (!url || !secretKey) {
  console.error("Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY");
  process.exit(1);
}

// `vercel env pull` writes production values into .env.local: a remote target must be asked for.
const target = supabaseTarget(url);
if (target === "remote" && !process.argv.includes("--remote")) {
  console.error("bootstrap: the target is remote; pass --remote explicitly to run against it");
  process.exit(1);
}
console.log(`bootstrap: target ${target}`);

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const result = await ensureBootstrapUser(process.env, admin);
switch (result.status) {
  case "absent":
    console.log("bootstrap: R2Y_BOOTSTRAP_* not set, nothing to do");
    break;
  case "created":
    console.log("bootstrap: first user created");
    break;
  case "exists":
    console.log("bootstrap: the user already exists, nothing changed");
    break;
  case "invalid-config":
  case "failed":
    console.error(`bootstrap: ${result.status}`);
    process.exit(1);
}
