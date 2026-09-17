alter table profiles add column if not exists affiliate_rate numeric(6,2);

create index if not exists profiles_referral_code_eq_idx on profiles (referral_code);
