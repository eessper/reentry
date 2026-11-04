import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import {
  canChangeRole,
  canEditProfile,
  isOrgAdmin,
  isVisibleTo,
  parseRole,
  type MembershipRole,
} from "./permissions.ts";
import {
  findInvalidEmail,
  MAX_SECONDARY_EMAILS,
  normalizeSecondaryEmails,
} from "./secondaryEmails.ts";

async function updateSaleDisabled(user_id: string, disabled: boolean) {
  return await supabaseAdmin
    .from("sales")
    .update({ disabled: disabled ?? false })
    .eq("user_id", user_id);
}

// memberships.role is the only source of a user's role.
async function updateMembershipRole(user_id: string, role: MembershipRole) {
  const { error } = await supabaseAdmin
    .from("memberships")
    .update({ role })
    .eq("user_id", user_id);

  if (error) {
    console.error("Error updating role:", error);
    throw error;
  }
}

async function getSaleWithRole(user_id: string) {
  const { data: sale, error } = await supabaseAdmin
    .from("sales_summary")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (!sale || error) {
    console.error("Error reading user:", error);
    throw error ?? new Error("Failed to read sale");
  }
  return sale;
}

async function findEmailUsedByAnotherSale(
  emails: string[],
  excludeSalesId?: number,
) {
  const isTakenBy = async (
    column: "email" | "secondary_emails",
    email: string,
  ) => {
    const selected = supabaseAdmin.from("sales").select("id");
    let query =
      column === "email"
        ? selected.eq("email", email)
        : selected.contains("secondary_emails", JSON.stringify([email]));

    if (excludeSalesId !== undefined) {
      query = query.neq("id", excludeSalesId);
    }

    const { data: matches, error: salesError } = await query.limit(1);

    if (salesError) {
      console.error("Error fetching sales:", salesError);
      throw salesError;
    }

    return Boolean(matches?.length);
  };

  for (const email of emails) {
    if (
      (await isTakenBy("email", email)) ||
      (await isTakenBy("secondary_emails", email))
    ) {
      return email;
    }
  }

  return undefined;
}

async function updateSaleSecondaryEmails(
  user_id: string,
  secondary_emails: string[],
) {
  const { error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ secondary_emails })
    .eq("user_id", user_id);

  if (salesError) {
    console.error("Error updating user:", salesError);
    throw salesError;
  }
}

async function updateSaleAvatar(user_id: string, avatar: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ avatar })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function inviteUser(req: Request, currentUserSale: any) {
  const { email, password, first_name, last_name, disabled, role } =
    await req.json();

  if (!isOrgAdmin(currentUserSale)) {
    return createErrorResponse(401, "Not Authorized");
  }

  const newRole = role === undefined ? "key_worker" : parseRole(role);
  if (!newRole) {
    return createErrorResponse(400, `Unknown role: ${role}`, {
      code: "invalid_role",
    });
  }

  const takenEmail = await findEmailUsedByAnotherSale(
    email ? [email.trim().toLowerCase()] : [],
  );
  if (takenEmail) {
    return createErrorResponse(
      409,
      `Email already used by another user: ${takenEmail}`,
      { code: "email_taken", email: takenEmail },
    );
  }

  // The organisation goes in app_metadata, which only the service role can
  // write; the database's handle_new_user trigger reads it to create the
  // membership and staff profile in the inviting admin's organisation.
  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    user_metadata: { first_name, last_name },
    app_metadata: {
      organisation_id: currentUserSale.organisation_id,
      role: newRole,
    },
  });

  if (userError?.code === "email_exists") {
    // Every account belongs to exactly one organisation, so an existing
    // account can't be re-used here: it may belong to another organisation.
    return createErrorResponse(409, "Email already used by another user", {
      code: "email_taken",
      email,
    });
  }
  if (userError) {
    console.error(`Error inviting user: user_error=${userError}`);
    return createErrorResponse(userError.status, userError.message, {
      code: userError.code,
    });
  }
  const user = data?.user;
  if (!user) {
    console.error("Error inviting user: undefined user");
    return createErrorResponse(500, "Internal Server Error");
  }
  const { error: emailError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email);

  if (emailError) {
    console.error(`Error inviting user, email_error=${emailError}`);
    return createErrorResponse(500, "Failed to send invitation mail");
  }

  try {
    await updateSaleDisabled(user.id, disabled);
    const sale = await getSaleWithRole(user.id);

    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

async function patchUser(req: Request, currentUserSale: any) {
  const {
    sales_id,
    email,
    secondary_emails,
    first_name,
    last_name,
    avatar,
    role,
    disabled,
  } = await req.json();
  const { data: sale } = await supabaseAdmin
    .from("sales_summary")
    .select("*")
    .eq("id", sales_id)
    .single();

  // A user outside the caller's organisation is reported as not found, so
  // the response doesn't confirm that the id exists elsewhere.
  if (!isVisibleTo(currentUserSale, sale)) {
    return createErrorResponse(404, "Not Found");
  }

  // Users can only update their own profile unless they are an administrator
  if (!canEditProfile(currentUserSale, sale)) {
    return createErrorResponse(401, "Not Authorized");
  }

  const newRole = role === undefined ? undefined : parseRole(role);
  if (role !== undefined && !newRole) {
    return createErrorResponse(400, `Unknown role: ${role}`, {
      code: "invalid_role",
    });
  }
  const isRoleChange = newRole !== undefined && newRole !== sale.role;
  if (isRoleChange && !canChangeRole(currentUserSale, sale)) {
    return createErrorResponse(403, "You can't change this user's role", {
      code: "role_change_forbidden",
    });
  }

  if (email && email.trim().toLowerCase() !== sale.email.toLowerCase()) {
    const takenEmail = await findEmailUsedByAnotherSale(
      [email.trim().toLowerCase()],
      sales_id,
    );
    if (takenEmail) {
      return createErrorResponse(
        409,
        `Email already used by another user: ${takenEmail}`,
        { code: "email_taken", email: takenEmail },
      );
    }
  }

  let normalizedSecondaryEmails: string[] | undefined;
  if (secondary_emails !== undefined) {
    normalizedSecondaryEmails = normalizeSecondaryEmails(secondary_emails);
    if (!normalizedSecondaryEmails) {
      return createErrorResponse(400, "secondary_emails must be an array", {
        code: "invalid_secondary_emails_payload",
      });
    }

    if (normalizedSecondaryEmails.length > MAX_SECONDARY_EMAILS) {
      return createErrorResponse(
        400,
        `No more than ${MAX_SECONDARY_EMAILS} secondary emails are allowed`,
        { code: "too_many_secondary_emails" },
      );
    }

    const invalidEmail = findInvalidEmail(normalizedSecondaryEmails);
    if (invalidEmail) {
      return createErrorResponse(
        400,
        `Invalid secondary email: ${invalidEmail}`,
        { code: "invalid_secondary_email", email: invalidEmail },
      );
    }

    const takenEmail = await findEmailUsedByAnotherSale(
      normalizedSecondaryEmails,
      sales_id,
    );
    if (takenEmail) {
      return createErrorResponse(
        409,
        `Secondary email already used by another user: ${takenEmail}`,
        { code: "secondary_email_taken", email: takenEmail },
      );
    }
  }

  const primaryEmail = (email ?? sale.email).trim().toLowerCase();
  const effectiveSecondaryEmails =
    normalizedSecondaryEmails ??
    (Array.isArray(sale.secondary_emails) ? sale.secondary_emails : []);

  if (effectiveSecondaryEmails.includes(primaryEmail)) {
    return createErrorResponse(
      409,
      `Secondary email is already the main address: ${primaryEmail}`,
      { code: "secondary_email_is_primary", email: primaryEmail },
    );
  }

  const { data, error: userError } =
    await supabaseAdmin.auth.admin.updateUserById(sale.user_id, {
      email,
      ban_duration: disabled ? "87600h" : "none",
      user_metadata: { first_name, last_name },
    });

  if (!data?.user || userError) {
    console.error("Error patching user:", userError);
    return createErrorResponse(500, "Internal Server Error");
  }

  try {
    if (avatar) {
      await updateSaleAvatar(data.user.id, avatar);
    }

    if (normalizedSecondaryEmails) {
      await updateSaleSecondaryEmails(data.user.id, normalizedSecondaryEmails);
    }
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }

  // Only administrators can update the role and disabled status
  if (!isOrgAdmin(currentUserSale)) {
    const new_sale = await getSaleWithRole(data.user.id);
    return new Response(
      JSON.stringify({
        data: new_sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }

  try {
    await updateSaleDisabled(data.user.id, disabled);
    if (isRoleChange && newRole) {
      await updateMembershipRole(data.user.id, newRole);
    }
    const sale = await getSaleWithRole(data.user.id);
    return new Response(
      JSON.stringify({
        data: sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const currentUserSale = await getUserSale(user);
        if (!currentUserSale) {
          return createErrorResponse(401, "Unauthorized");
        }

        try {
          if (req.method === "POST") {
            return await inviteUser(req, currentUserSale);
          }

          if (req.method === "PATCH") {
            return await patchUser(req, currentUserSale);
          }
        } catch (e) {
          console.error("Unhandled error in the users function:", e);
          return createErrorResponse(500, "Internal Server Error");
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
