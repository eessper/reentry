// Creates an organisation (tenant) and invites its first admin.
//
// Self-signup is blocked in the database: every account must be created with
// an organisation in its app metadata. This operator script is how the first
// admin of a new organisation gets in. After that, the admin invites their own
// staff from the app.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/create-organisation.mjs --name "Example Probation Region" --email admin@example.org
//
// Add --password <password> to create the admin with a password instead of
// emailing an invitation (local development only).
//
// The service role key bypasses all security rules: never commit it, and only
// run this from a trusted machine.

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    "first-name": { type: "string", default: "" },
    "last-name": { type: "string", default: "" },
  },
});

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}
if (!values.name?.trim() || !values.email?.trim()) {
  fail(
    'Usage: node scripts/create-organisation.mjs --name "<organisation>" --email <admin email> [--password <password>]',
  );
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: organisation, error: organisationError } = await supabase
  .from("organisations")
  .insert({ name: values.name.trim() })
  .select()
  .single();
if (organisationError) {
  fail(`Could not create the organisation: ${organisationError.message}`);
}

const adminAttributes = {
  data: {
    first_name: values["first-name"],
    last_name: values["last-name"],
  },
};
const appMetadata = { organisation_id: organisation.id, role: "org_admin" };

const { error: userError } = values.password
  ? await supabase.auth.admin.createUser({
      email: values.email.trim(),
      password: values.password,
      email_confirm: true,
      user_metadata: adminAttributes.data,
      app_metadata: appMetadata,
    })
  : await createAndInvite(values.email.trim());

if (userError) {
  // Remove the empty organisation so a retry starts clean.
  await supabase.from("organisations").delete().eq("id", organisation.id);
  fail(`Could not create the admin: ${userError.message}`);
}

process.stdout.write(
  `Created organisation "${organisation.name}" (${organisation.id}) with admin ${values.email.trim()}.\n`,
);

async function createAndInvite(email) {
  const { error } = await supabase.auth.admin.createUser({
    email,
    user_metadata: adminAttributes.data,
    app_metadata: appMetadata,
  });
  if (error) return { error };
  return supabase.auth.admin.inviteUserByEmail(email);
}
