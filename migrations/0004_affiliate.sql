alter table profiles add column if not exists referral_code text;
alter table profiles add column if not exists referred_by text;

create unique index if not exists profiles_referral_code_uidx
  on profiles (referral_code) where referral_code is not null;
create index if not exists profiles_referred_by_idx on profiles (referred_by);

create table if not exists affiliate_commissions (
  id serial primary key,
  referrer_id text not null,
  referee_id text not null,
  deposit_id integer,
  base_amount numeric(18,2) not null,
  rate numeric(6,2) not null,
  amount numeric(18,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists aff_comm_referrer_idx on affiliate_commissions (referrer_id, created_at desc);
create unique index if not exists aff_comm_deposit_uidx on affiliate_commissions (deposit_id) where deposit_id is not null;

insert into settings (key, value) values
  ('affiliate_enabled', 'true'),
  ('affiliate_rate', '10')
on conflict (key) do nothing;
