import { type User } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "./supabaseAdmin.ts";

/**
 * Get the sale associated to the provided user, with their membership role.
 */
export const getUserSale = async (user: User) => {
  return (
    await supabaseAdmin
      .from("sales_summary")
      .select("*")
      .eq("user_id", user.id)
      .single()
  )?.data;
};
