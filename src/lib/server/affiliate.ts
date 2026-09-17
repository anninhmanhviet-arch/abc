import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, authMiddleware, n, requireAdmin, requireActiveUser, applyLedger, setting, type Sql } from "./core";
import { iso } from "@/lib/format";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESERVED = new Set([
  "ACCOUNT", "ADMIN", "AFFILIATE", "API", "ASSETS", "BODE", "DEPOSIT", "FAVICON",
  "FORGOT", "HISTORY", "INDEX", "LOGIN", "NOTIFICATIONS", "REGISTER", "RESET",
  "STATIC", "SUPPORT", "TRADE", "WALLET", "WITHDRAW", "VERTEX",
]);

export function makeReferralCode() {
  let s = "";
  const buf = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 6; i++) s += ALPH[buf[i]! % ALPH.length];
  return s;
}

function normCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function ensureAffiliateSchema(sql: Sql) {
  await sql`alter table profiles add column if not exists referral_code text`;
  await sql`alter table profiles add column if not exists referred_by text`;
  await sql`alter table profiles add column if not exists affiliate_rate numeric(6,2)`;
  await sql`create table if not exists affiliate_commissions (
    id serial primary key,
    referrer_id text not null,
    referee_id text not null,
    deposit_id integer,
    base_amount numeric(18,2) not null,
    rate numeric(6,2) not null,
    amount numeric(18,2) not null,
    created_at timestamptz not null default now()
  )`;
  await sql`insert into settings (key, value) values ('affiliate_enabled', 'true') on conflict (key) do nothing`;
  await sql`insert into settings (key, value) values ('affiliate_rate', '10') on conflict (key) do nothing`;
}

export async function ensureReferralCode(sql: Sql, userId: string): Promise<string> {
  await ensureAffiliateSchema(sql);
  const row = await sql<{ referral_code: string | null }>`
    select referral_code from profiles where user_id = ${userId}`;
  if (row[0]?.referral_code) return row[0].referral_code;
  let code = makeReferralCode();
  for (let i = 0; i < 16; i++) {
    if (!RESERVED.has(code)) {
      const clash = await sql<{ c: number }>`select count(*)::int as c from profiles where referral_code = ${code}`;
      if (!(clash[0]?.c)) break;
    }
    code = makeReferralCode();
  }
  await sql`update profiles set referral_code = ${code} where user_id = ${userId} and referral_code is null`;
  const again = await sql<{ referral_code: string | null }>`select referral_code from profiles where user_id = ${userId}`;
  return again[0]?.referral_code ?? code;
}

export async function bindReferral(sql: Sql, userId: string, rawCode: string) {
  const code = normCode(rawCode);
  if (!code) return;
  const mine = await sql<{ referred_by: string | null; referral_code: string | null }>`
    select referred_by, referral_code from profiles where user_id = ${userId}`;
  if (mine[0]?.referred_by) return;
  if ((mine[0]?.referral_code ?? "").toUpperCase() === code) throw new Error("Không thể dùng mã của chính mình");
  const owner = await sql<{ user_id: string }>`select user_id from profiles where referral_code = ${code}`;
  if (!owner[0]) throw new Error("Mã giới thiệu không tồn tại");
  if (owner[0].user_id === userId) throw new Error("Không thể dùng mã của chính mình");
  await sql`update profiles set referred_by = ${owner[0].user_id} where user_id = ${userId} and referred_by is null`;
}

async function effectiveRate(sql: Sql, referrerId: string): Promise<number> {
  const global = Math.max(0, Math.min(100, n(await setting(sql, "affiliate_rate", "10"))));
  const row = await sql<{ affiliate_rate: string | null }>`
    select affiliate_rate from profiles where user_id = ${referrerId}`;
  if (row[0]?.affiliate_rate == null || row[0].affiliate_rate === "") return global;
  return Math.max(0, Math.min(100, n(row[0].affiliate_rate)));
}

export async function payDepositCommission(sql: Sql, refereeId: string, depositId: number, depositAmt: number) {
  const sqlx = sql;
  try {
    await ensureAffiliateSchema(sqlx);
  } catch {
    /* ignore */
  }
  const on = (await setting(sqlx, "affiliate_enabled", "true")) === "true";
  if (!on) return;
  const prof = await sqlx<{ referred_by: string | null }>`select referred_by from profiles where user_id = ${refereeId}`;
  const referrerId = prof[0]?.referred_by;
  if (!referrerId || referrerId === refereeId) return;
  const rate = await effectiveRate(sqlx, referrerId);
  if (rate <= 0 || depositAmt <= 0) return;
  const paid = await sqlx<{ id: number }>`select id from affiliate_commissions where deposit_id = ${depositId}`;
  if (paid[0]) return;
  const amount = Math.floor((depositAmt * rate) / 100);
  if (amount <= 0) return;
  await sqlx`insert into affiliate_commissions (referrer_id, referee_id, deposit_id, base_amount, rate, amount)
    values (${referrerId}, ${refereeId}, ${depositId}, ${depositAmt}, ${rate}, ${amount})`;
  await applyLedger(sqlx, referrerId, "commission", amount, `Hoa hong nap #${depositId}`, "deposit", depositId);
}

export const peekReferral = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().min(1).max(16) }))
  .handler(async ({ data }) => {
    const code = normCode(data.code);
    if (!code || RESERVED.has(code)) return { ok: false as const, code };
    const sql = await getSql();
    await ensureAffiliateSchema(sql);
    const rows = await sql<{ c: number }>`select count(*)::int as c from profiles where referral_code = ${code}`;
    return { ok: (rows[0]?.c ?? 0) > 0, code };
  });

export const claimReferral = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().min(1).max(16) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireActiveUser(sql, context.userId);
    await ensureReferralCode(sql, context.userId);
    await bindReferral(sql, context.userId, data.code);
    return { ok: true };
  });

export const getMyAffiliate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await requireActiveUser(sql, context.userId);
    const code = await ensureReferralCode(sql, context.userId);
    const global = n(await setting(sql, "affiliate_rate", "10"));
    const rate = await effectiveRate(sql, context.userId);
    const enabled = (await setting(sql, "affiliate_enabled", "true")) === "true";
    const stats = await sql<{ friends: number; earned: string }>`
      select
        (select count(*)::int from profiles where referred_by = ${context.userId}) as friends,
        coalesce((select sum(amount) from affiliate_commissions where referrer_id = ${context.userId}), 0)::text as earned`;
    const friends = await sql<{
      user_id: string;
      email: string;
      display_name: string;
      created_at: unknown;
      deposited: string;
    }>`select p.user_id, u.email, p.display_name, p.created_at,
             coalesce((select sum(amount) from deposits d where d.user_id = p.user_id and d.status = 'approved'), 0)::text as deposited
       from profiles p
       join "user" u on u.id = p.user_id
       where p.referred_by = ${context.userId}
       order by p.created_at desc
       limit 50`;
    const comms = await sql<{
      id: number;
      referee_id: string;
      email: string;
      base_amount: string;
      rate: string;
      amount: string;
      created_at: unknown;
    }>`select c.id, c.referee_id, u.email, c.base_amount, c.rate, c.amount, c.created_at
       from affiliate_commissions c
       join "user" u on u.id = c.referee_id
       where c.referrer_id = ${context.userId}
       order by c.created_at desc limit 40`;
    const me = await sql<{ referred_by: string | null }>`select referred_by from profiles where user_id = ${context.userId}`;
    return {
      code,
      rate,
      globalRate: global,
      enabled,
      friends: stats[0]?.friends ?? 0,
      earned: n(stats[0]?.earned),
      referred: Boolean(me[0]?.referred_by),
      rows: friends.map((f) => ({
        email: maskEmail(f.email),
        name: f.display_name,
        createdAt: iso(f.created_at),
        deposited: n(f.deposited),
      })),
      commissions: comms.map((c) => ({
        id: c.id,
        email: maskEmail(c.email),
        baseAmount: n(c.base_amount),
        rate: n(c.rate),
        amount: n(c.amount),
        createdAt: iso(c.created_at),
      })),
    };
  });

export const saveAffiliateSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    rate: z.string().min(1).max(8),
    enabled: z.boolean(),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await ensureAffiliateSchema(sql);
    const rate = String(Math.max(0, Math.min(100, n(data.rate))));
    const enabled = data.enabled ? "true" : "false";
    await sql`insert into settings (key, value) values ('affiliate_rate', ${rate})
      on conflict (key) do update set value = excluded.value`;
    await sql`insert into settings (key, value) values ('affiliate_enabled', ${enabled})
      on conflict (key) do update set value = excluded.value`;
    return { ok: true, rate: n(rate), enabled: data.enabled };
  });

export const getAdminAffiliate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { q?: string } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await ensureAffiliateSchema(sql);
    const global = n(await setting(sql, "affiliate_rate", "10"));
    const enabled = (await setting(sql, "affiliate_enabled", "true")) === "true";
    const q = (data.q ?? "").trim();
    const like = q ? `%${q}%` : null;
    const people = await sql<{
      user_id: string;
      email: string;
      referral_code: string | null;
      affiliate_rate: string | null;
    }>`select p.user_id, u.email, p.referral_code, p.affiliate_rate
       from profiles p
       join "user" u on u.id = p.user_id
       where coalesce(p.role, 'user') <> 'admin'
         and (${like}::text is null
           or u.email ilike ${like}
           or coalesce(p.referral_code, '') ilike ${like}
           or p.display_name ilike ${like})
       order by p.created_at desc
       limit 100`;
    const friendRows = await sql<{ referrer_id: string; friends: number }>`
      select referred_by as referrer_id, count(*)::int as friends
      from profiles where referred_by is not null group by referred_by`;
    const earnRows = await sql<{ referrer_id: string; earned: string }>`
      select referrer_id, coalesce(sum(amount), 0)::text as earned
      from affiliate_commissions group by referrer_id`;
    const friendsMap = new Map(friendRows.map((r) => [r.referrer_id, r.friends]));
    const earnMap = new Map(earnRows.map((r) => [r.referrer_id, n(r.earned)]));
    const tot = await sql<{ c: string }>`select coalesce(sum(amount),0)::text as c from affiliate_commissions`;
    const recent = await sql<{
      id: number;
      referrer_email: string;
      referee_email: string;
      base_amount: string;
      rate: string;
      amount: string;
      created_at: unknown;
    }>`select c.id, r.email as referrer_email, f.email as referee_email, c.base_amount, c.rate, c.amount, c.created_at
       from affiliate_commissions c
       join "user" r on r.id = c.referrer_id
       join "user" f on f.id = c.referee_id
       order by c.created_at desc limit 40`;
    return {
      rate: global,
      enabled,
      paid: n(tot[0]?.c),
      leaders: people.map((l) => {
        const custom = l.affiliate_rate == null || l.affiliate_rate === "" ? null : n(l.affiliate_rate);
        return {
          userId: l.user_id,
          email: l.email,
          code: l.referral_code ?? "",
          friends: friendsMap.get(l.user_id) ?? 0,
          earned: earnMap.get(l.user_id) ?? 0,
          customRate: custom,
          effectiveRate: custom ?? global,
        };
      }),
      recent: recent.map((r) => ({
        id: r.id,
        referrer: r.referrer_email,
        referee: r.referee_email,
        baseAmount: n(r.base_amount),
        rate: n(r.rate),
        amount: n(r.amount),
        createdAt: iso(r.created_at),
      })),
    };
  });

export const setUserAffiliateRate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), rate: z.number().min(0).max(100).nullable() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await ensureAffiliateSchema(sql);
    await sql`update profiles set affiliate_rate = ${data.rate}, updated_at = now() where user_id = ${data.userId}`;
    return { ok: true };
  });

function maskEmail(email: string) {
  const [a, b] = email.split("@");
  if (!b) return "***";
  const head = a.slice(0, 2);
  return `${head}***@${b}`;
}
