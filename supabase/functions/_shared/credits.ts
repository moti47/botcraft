/**
 * Shared credit helpers. Edge Functions import these to enforce free-tier
 * quotas: read balance, spend credits transactionally, check avatar caps.
 *
 * Pricing (in "credits"):
 *   spend_video  = 10
 *   spend_image  = 1     (avatar portrait or thumbnail regen)
 *   spend_live   = 50    (1 minute of live, future)
 *
 * Free plan grants 200/month (≈ 20 videos). Pro/Studio override via user_plans.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

export const COST = {
  video: 10,
  image: 1,
  live: 50,
  campaign_post: 5,
} as const;

export type SpendKind = keyof typeof COST;

/** Return the user's current balance + tier. NULL if no plan row (shouldn't happen post-trigger). */
export async function getBalance(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("user_credit_balance")
    .select("tier, monthly_credits, balance, effective_balance")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { tier: string; monthly_credits: number; balance: number; effective_balance: number } | null;
}

/** Return max_avatars + current count. */
export async function getAvatarCap(db: SupabaseClient, userId: string) {
  const [{ data: plan }, { count }] = await Promise.all([
    db.from("user_plans").select("max_avatars").eq("user_id", userId).maybeSingle(),
    db.from("avatars").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  return { max_avatars: plan?.max_avatars ?? 2, current: count ?? 0 };
}

/**
 * Spend credits. Inserts a negative usage_credits row. Caller MUST check
 * balance first; this does not block on insufficient funds (so we don't
 * race against parallel ops), but it returns the new effective_balance so
 * callers can refuse to proceed if it went negative.
 */
export async function spendCredits(
  db: SupabaseClient,
  userId: string,
  kind: SpendKind,
  referenceId?: string,
  metadata: Record<string, unknown> = {},
): Promise<{ spent: number; remaining: number }> {
  const cost = COST[kind];
  await db.from("usage_credits").insert([{
    user_id: userId,
    delta: -cost,
    kind: `spend_${kind}`,
    reference_id: referenceId || null,
    metadata,
  }]);
  const bal = await getBalance(db, userId);
  return { spent: cost, remaining: bal?.effective_balance ?? 0 };
}

/** Pre-flight check: returns null if user can afford, else a reason string. */
export async function precheck(
  db: SupabaseClient,
  userId: string,
  kind: SpendKind,
): Promise<string | null> {
  const bal = await getBalance(db, userId);
  if (!bal) return "no_plan";
  if (bal.effective_balance < COST[kind]) {
    return `insufficient_credits (need ${COST[kind]}, have ${bal.effective_balance})`;
  }
  return null;
}
