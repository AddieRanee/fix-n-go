-- Fix n Go Garage: schema + RPCs

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  role text not null check (role in ('Admin', 'Staff'))
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_name text not null,
  category text not null,
  stock_quantity integer not null check (stock_quantity >= 0),
  price numeric(12,2) not null check (price >= 0),
  date_issued date,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

create table if not exists public.spare_parts (
  id uuid primary key default gen_random_uuid(),
  -- item_code/item_name/category/company are optional (sometimes supplier doesn't provide full info).
  item_code text,
  item_name text,
  category text,
  company text,
  stock_quantity integer not null check (stock_quantity >= 0),
  price numeric(12,2) not null check (price >= 0),
  previous_price numeric(12,2),
  price_increase numeric(12,2),
  payment_status text not null default 'unpaid' check (payment_status in ('paid', 'unpaid')),
  date_issued date,
  created_at timestamptz not null default now(),
  last_updated timestamptz not null default now()
);

-- If you already created the tables, add new columns safely.
alter table public.inventory add column if not exists date_issued date;
alter table public.inventory add column if not exists created_at timestamptz not null default now();
alter table public.spare_parts add column if not exists previous_price numeric(12,2);
alter table public.spare_parts add column if not exists price_increase numeric(12,2);
alter table public.spare_parts add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('paid', 'unpaid'));
alter table public.spare_parts add column if not exists date_issued date;
alter table public.spare_parts add column if not exists created_at timestamptz not null default now();
alter table public.spare_parts alter column price_increase drop default;
update public.spare_parts set price_increase = null where price_increase = 0;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  item_type text not null default 'inventory' check (item_type in ('inventory', 'spare_part')),
  item_code text,
  item_name text,
  service_description text,
  quantity_used integer not null check (quantity_used > 0),
  price numeric(12,2) not null check (price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  number_plate text not null,
  staff_name text not null,
  date date not null default current_date,
  time time not null default localtime
);

-- Receipts (multi-line) ------------------------------------------------------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  rec_no serial not null unique,
  number_plate text not null,
  staff_name text not null default '',
  created_by_id uuid,
  created_at timestamptz not null default now()
);

-- Set the starting value for rec_no sequence to 1000
alter sequence if exists public.receipts_rec_no_seq restart with 1000;

create table if not exists public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  line_type text not null check (line_type in ('inventory', 'spare_part', 'service', 'custom')),
  inventory_item_code text,
  spare_part_id uuid,
  description text,
  quantity integer check (quantity is null or quantity > 0),
  unit_price numeric(12,2) check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;

drop policy if exists receipts_select_authenticated on public.receipts;
create policy receipts_select_authenticated
on public.receipts
for select
to authenticated
using (true);

drop policy if exists receipts_insert_authenticated on public.receipts;
create policy receipts_insert_authenticated
on public.receipts
for insert
to authenticated
with check (created_by_id = auth.uid());

drop policy if exists receipts_update_authenticated on public.receipts;
create policy receipts_update_authenticated
on public.receipts
for update
to authenticated
using (true)
with check (true);

drop policy if exists receipts_delete_authenticated on public.receipts;
create policy receipts_delete_authenticated
on public.receipts
for delete
to authenticated
using (true);

drop policy if exists receipt_lines_select_authenticated on public.receipt_lines;
create policy receipt_lines_select_authenticated
on public.receipt_lines
for select
to authenticated
using (true);

drop policy if exists receipt_lines_insert_authenticated on public.receipt_lines;
create policy receipt_lines_insert_authenticated
on public.receipt_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.receipts r
    where r.id = receipt_id
  )
);

drop policy if exists receipt_lines_update_authenticated on public.receipt_lines;
create policy receipt_lines_update_authenticated
on public.receipt_lines
for update
to authenticated
using (true)
with check (true);

drop policy if exists receipt_lines_delete_authenticated on public.receipt_lines;
create policy receipt_lines_delete_authenticated
on public.receipt_lines
for delete
to authenticated
using (true);

-- Daily notes (multi-note per day)
create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null default current_date,
  content text not null default '',
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.note_likes (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.daily_notes(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (note_id, user_id)
);

create table if not exists public.note_comments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.daily_notes(id) on delete cascade,
  user_id uuid not null,
  user_name text,
  content text not null,
  created_at timestamptz not null default now()
);

-- Profiles (lightweight, auto-synced from auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  phone text,
  provider_type text,
  notes_signature text,
  avatar_type text,
  avatar_icon text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, display_name, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', new.email),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        phone = coalesce(new.raw_user_meta_data->>'phone', excluded.phone),
        provider_type = coalesce(new.raw_user_meta_data->>'provider_type', excluded.provider_type),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile
after insert or update on auth.users
for each row execute function public.handle_auth_user_profile();

alter table public.profiles enable row level security;

create policy profiles_read on public.profiles
for select to authenticated
using (true);

create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid());

create or replace function public.sync_profile()
returns void
language plpgsql
security definer
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return;
  end if;

  insert into public.profiles (id, email, display_name, phone, provider_type, created_at, updated_at)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'first_name', u.email),
    u.raw_user_meta_data->>'phone',
    u.raw_user_meta_data->>'provider_type',
    now(),
    now()
  from auth.users u
  where u.id = v_id
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        phone = excluded.phone,
        provider_type = excluded.provider_type,
        updated_at = now();
end;
$$;

alter table public.daily_notes enable row level security;
alter table public.note_likes enable row level security;
alter table public.note_comments enable row level security;

create policy daily_notes_read on public.daily_notes
for select to authenticated
using (true);

create policy daily_notes_insert on public.daily_notes
for insert to authenticated
with check (true);

create policy daily_notes_delete_own on public.daily_notes
for delete to authenticated
using (created_by_id = auth.uid());

create policy note_likes_read on public.note_likes
for select to authenticated
using (true);

create policy note_likes_insert on public.note_likes
for insert to authenticated
with check (user_id = auth.uid());

create policy note_likes_delete_own on public.note_likes
for delete to authenticated
using (user_id = auth.uid());

create policy note_comments_read on public.note_comments
for select to authenticated
using (true);

create policy note_comments_insert on public.note_comments
for insert to authenticated
with check (user_id = auth.uid());

create policy note_comments_delete_own on public.note_comments
for delete to authenticated
using (user_id = auth.uid());

create index if not exists idx_inventory_item_code on public.inventory (item_code);
create index if not exists idx_spare_parts_item_code on public.spare_parts (item_code);
create unique index if not exists uq_spare_parts_item_code_nonblank
on public.spare_parts (item_code)
where item_code is not null and length(trim(item_code)) > 0;
create index if not exists idx_spare_parts_item_name on public.spare_parts (item_name);
create index if not exists idx_spare_parts_company on public.spare_parts (company);
create index if not exists idx_transactions_job_id on public.transactions (job_id);
create index if not exists idx_transactions_number_plate on public.transactions (number_plate);
create index if not exists idx_transactions_item_code on public.transactions (item_code);
create index if not exists idx_transactions_item_type on public.transactions (item_type);
create index if not exists idx_transactions_date on public.transactions (date);

create index if not exists idx_receipts_rec_no on public.receipts (rec_no);
create index if not exists idx_receipts_number_plate on public.receipts (number_plate);
create index if not exists idx_receipt_lines_receipt_id on public.receipt_lines (receipt_id);

-- Purchase inventory: insert new item or add to existing stock (atomic).
create or replace function public.purchase_inventory_item(
  p_item_code text,
  p_item_name text,
  p_category text,
  p_add_quantity integer,
  p_price numeric
)
returns public.inventory
language plpgsql
as $$
declare
  v_item public.inventory%rowtype;
begin
  if p_item_code is null or length(trim(p_item_code)) = 0 then
    raise exception 'item_code is required';
  end if;
  if p_item_name is null or length(trim(p_item_name)) = 0 then
    raise exception 'item_name is required';
  end if;
  if p_category is null or length(trim(p_category)) = 0 then
    raise exception 'category is required';
  end if;
  if p_add_quantity is null or p_add_quantity <= 0 then
    raise exception 'add_quantity must be > 0';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'price must be >= 0';
  end if;

  select * into v_item
  from public.inventory
  where item_code = p_item_code
  for update;

  if not found then
    insert into public.inventory (item_code, item_name, category, stock_quantity, price, last_updated)
    values (trim(p_item_code), trim(p_item_name), trim(p_category), p_add_quantity, p_price, now())
    returning * into v_item;
    return v_item;
  end if;

  update public.inventory
  set item_name = trim(p_item_name),
      category = trim(p_category),
      price = p_price,
      stock_quantity = stock_quantity + p_add_quantity,
      last_updated = now()
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

-- Add stock to an existing inventory item (atomic).
create or replace function public.add_inventory_stock(
  p_item_code text,
  p_add_quantity integer,
  p_price numeric default null
)
returns public.inventory
language plpgsql
as $$
declare
  v_item public.inventory%rowtype;
begin
  if p_item_code is null or length(trim(p_item_code)) = 0 then
    raise exception 'item_code is required';
  end if;
  if p_add_quantity is null or p_add_quantity <= 0 then
    raise exception 'add_quantity must be > 0';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'price must be >= 0';
  end if;

  select * into v_item
  from public.inventory
  where item_code = p_item_code
  for update;

  if not found then
    raise exception 'item_code not found: %', p_item_code;
  end if;

  update public.inventory
  set stock_quantity = stock_quantity + p_add_quantity,
      price = coalesce(p_price, price),
      last_updated = now()
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

-- Purchase spare part: insert new item or add to existing stock (atomic).
create or replace function public.purchase_spare_part(
  p_item_code text,
  p_item_name text,
  p_category text,
  p_company text,
  p_add_quantity integer,
  p_price numeric
)
returns public.spare_parts
language plpgsql
as $$
declare
  v_item public.spare_parts%rowtype;
begin
  if p_item_code is null or length(trim(p_item_code)) = 0 then
    raise exception 'item_code is required';
  end if;
  if p_item_name is null or length(trim(p_item_name)) = 0 then
    raise exception 'item_name is required';
  end if;
  if p_category is null or length(trim(p_category)) = 0 then
    raise exception 'category is required';
  end if;
  if p_company is null or length(trim(p_company)) = 0 then
    raise exception 'company is required';
  end if;
  if p_add_quantity is null or p_add_quantity <= 0 then
    raise exception 'add_quantity must be > 0';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'price must be >= 0';
  end if;

  select * into v_item
  from public.spare_parts
  where item_code = p_item_code
  for update;

  if not found then
    insert into public.spare_parts (
      item_code,
      item_name,
      category,
      company,
      stock_quantity,
      price,
      last_updated
    )
    values (
      trim(p_item_code),
      trim(p_item_name),
      trim(p_category),
      trim(p_company),
      p_add_quantity,
      p_price,
      now()
    )
    returning * into v_item;
    return v_item;
  end if;

  update public.spare_parts
  set item_name = trim(p_item_name),
      category = trim(p_category),
      company = trim(p_company),
      price = p_price,
      previous_price = v_item.price,
      price_increase = case
        when p_price > v_item.price then p_price - v_item.price
        else null
      end,
      stock_quantity = stock_quantity + p_add_quantity,
      last_updated = now()
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

-- Add stock to an existing spare part (atomic).
create or replace function public.add_spare_part_stock(
  p_item_code text,
  p_add_quantity integer,
  p_price numeric default null,
  p_company text default null
)
returns public.spare_parts
language plpgsql
as $$
declare
  v_item public.spare_parts%rowtype;
begin
  if p_item_code is null or length(trim(p_item_code)) = 0 then
    raise exception 'item_code is required';
  end if;
  if p_add_quantity is null or p_add_quantity <= 0 then
    raise exception 'add_quantity must be > 0';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'price must be >= 0';
  end if;

  select * into v_item
  from public.spare_parts
  where item_code = p_item_code
  for update;

  if not found then
    raise exception 'item_code not found: %', p_item_code;
  end if;

  update public.spare_parts
  set stock_quantity = stock_quantity + p_add_quantity,
      price = coalesce(p_price, price),
      company = coalesce(nullif(trim(p_company), ''), company),
      previous_price = case
        when p_price is null or p_price = price then previous_price
        else price
      end,
      price_increase = case
        when p_price is null or p_price = price then price_increase
        when p_price > price then p_price - price
        else null
      end,
      last_updated = now()
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

-- Add stock to an existing spare part by id (works even when item_code is blank).
create or replace function public.add_spare_part_stock_by_id(
  p_id uuid,
  p_add_quantity integer,
  p_price numeric default null,
  p_company text default null
)
returns public.spare_parts
language plpgsql
as $$
declare
  v_item public.spare_parts%rowtype;
begin
  if p_id is null then
    raise exception 'id is required';
  end if;
  if p_add_quantity is null or p_add_quantity <= 0 then
    raise exception 'add_quantity must be > 0';
  end if;
  if p_price is not null and p_price < 0 then
    raise exception 'price must be >= 0';
  end if;

  select * into v_item
  from public.spare_parts
  where id = p_id
  for update;

  if not found then
    raise exception 'id not found: %', p_id;
  end if;

  update public.spare_parts
  set stock_quantity = stock_quantity + p_add_quantity,
      price = coalesce(p_price, price),
      company = coalesce(nullif(trim(p_company), ''), company),
      previous_price = case
        when p_price is null or p_price = price then previous_price
        else price
      end,
      price_increase = case
        when p_price is null or p_price = price then price_increase
        when p_price > price then p_price - price
        else null
      end,
      last_updated = now()
  where id = v_item.id
  returning * into v_item;

  return v_item;
end;
$$;

-- Atomic inventory usage + transaction insert
create or replace function public.use_inventory_item(
  p_job_id text,
  p_item_code text,
  p_quantity_used integer,
  p_number_plate text,
  p_staff_name text default '',
  p_service_description text default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_item public.inventory%rowtype;
  v_tx public.transactions%rowtype;
begin
  if p_quantity_used is null or p_quantity_used <= 0 then
    raise exception 'quantity_used must be > 0';
  end if;

  select * into v_item
  from public.inventory
  where item_code = p_item_code
  for update;

  if not found then
    raise exception 'item_code not found: %', p_item_code;
  end if;

  if v_item.stock_quantity < p_quantity_used then
    raise exception 'insufficient stock: % (have %, need %)', p_item_code, v_item.stock_quantity, p_quantity_used;
  end if;

  update public.inventory
  set stock_quantity = stock_quantity - p_quantity_used,
      last_updated = now()
  where item_code = p_item_code;

  insert into public.transactions (
    job_id,
    item_type,
    item_code,
    item_name,
    service_description,
    quantity_used,
    price,
    total_price,
    number_plate,
    staff_name,
    date,
    time
  ) values (
    p_job_id,
    'inventory',
    v_item.item_code,
    v_item.item_name,
    nullif(trim(p_service_description), ''),
    p_quantity_used,
    v_item.price,
    (v_item.price * p_quantity_used),
    p_number_plate,
    coalesce(nullif(trim(p_staff_name), ''), ''),
    current_date,
    localtime
  )
  returning * into v_tx;

  return v_tx;
end;
$$;

-- Atomic spare parts usage + transaction insert (by id; works when item_code is blank).
create or replace function public.use_spare_part_by_id(
  p_job_id text,
  p_spare_part_id uuid,
  p_quantity_used integer,
  p_number_plate text,
  p_staff_name text default '',
  p_service_description text default null
)
returns public.transactions
language plpgsql
as $$
declare
  v_item public.spare_parts%rowtype;
  v_tx public.transactions%rowtype;
begin
  if p_quantity_used is null or p_quantity_used <= 0 then
    raise exception 'quantity_used must be > 0';
  end if;

  select * into v_item
  from public.spare_parts
  where id = p_spare_part_id
  for update;

  if not found then
    raise exception 'spare_part id not found: %', p_spare_part_id;
  end if;

  if v_item.stock_quantity < p_quantity_used then
    raise exception 'insufficient stock: % (have %, need %)', coalesce(v_item.item_code, v_item.id::text), v_item.stock_quantity, p_quantity_used;
  end if;

  update public.spare_parts
  set stock_quantity = stock_quantity - p_quantity_used,
      last_updated = now()
  where id = p_spare_part_id;

  insert into public.transactions (
    job_id,
    item_type,
    item_code,
    item_name,
    service_description,
    quantity_used,
    price,
    total_price,
    number_plate,
    staff_name,
    date,
    time
  ) values (
    p_job_id,
    'spare_part',
    v_item.item_code,
    v_item.item_name,
    nullif(trim(p_service_description), ''),
    p_quantity_used,
    v_item.price,
    (v_item.price * p_quantity_used),
    p_number_plate,
    coalesce(nullif(trim(p_staff_name), ''), ''),
    current_date,
    localtime
  )
  returning * into v_tx;

  return v_tx;
end;
$$;

-- Create a multi-line receipt and (optionally) deduct stock for inventory/spare parts.
-- p_lines JSON format:
-- [
--   {"type":"inventory","item_code":"ITM001","qty":2,"unit_price":40.5},
--   {"type":"spare_part","spare_part_id":"<uuid>","qty":1},
--   {"type":"service","description":"Oil change","qty":1,"unit_price":50},
--   {"type":"custom","description":"Discount","qty":1,"unit_price":0}
-- ]
create or replace function public.create_receipt(
  p_number_plate text,
  p_lines jsonb,
  p_staff_name text default ''
)
returns uuid
language plpgsql
as $$
declare
  v_receipt_id uuid;
  v_line jsonb;
  v_type text;
  v_qty integer;
  v_unit_price numeric;
  v_item_code text;
  v_spare_part_id uuid;
  v_desc text;
  v_inv public.inventory%rowtype;
  v_sp public.spare_parts%rowtype;
begin
  if p_number_plate is null or length(trim(p_number_plate)) = 0 then
    raise exception 'number_plate is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a JSON array';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'at least 1 line is required';
  end if;

  insert into public.receipts (number_plate, staff_name, created_by_id)
  values (trim(p_number_plate), coalesce(nullif(trim(p_staff_name), ''), ''), auth.uid())
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_type := coalesce(v_line->>'type', '');
    v_qty := nullif(coalesce(v_line->>'qty', ''), '')::integer;
    v_unit_price := nullif(coalesce(v_line->>'unit_price', ''), '')::numeric;
    v_desc := nullif(trim(coalesce(v_line->>'description', '')), '');

    if v_qty is null then v_qty := 1; end if;
    if v_qty <= 0 then raise exception 'qty must be > 0'; end if;
    if v_unit_price is not null and v_unit_price < 0 then raise exception 'unit_price must be >= 0'; end if;

    if v_type = 'inventory' then
      v_item_code := nullif(trim(coalesce(v_line->>'item_code', '')), '');
      if v_item_code is null then raise exception 'inventory item_code is required'; end if;

      select * into v_inv from public.inventory where item_code = v_item_code for update;
      if not found then raise exception 'item_code not found: %', v_item_code; end if;
      if v_inv.stock_quantity < v_qty then
        raise exception 'insufficient stock: % (have %, need %)', v_item_code, v_inv.stock_quantity, v_qty;
      end if;

      update public.inventory
      set stock_quantity = stock_quantity - v_qty,
          last_updated = now()
      where item_code = v_item_code;

      insert into public.receipt_lines (
        receipt_id, line_type, inventory_item_code, description, quantity, unit_price
      ) values (
        v_receipt_id, 'inventory', v_item_code, v_inv.item_name, v_qty, coalesce(v_unit_price, v_inv.price)
      );

    elsif v_type = 'spare_part' then
      v_spare_part_id := nullif(coalesce(v_line->>'spare_part_id', ''), '')::uuid;
      if v_spare_part_id is null then raise exception 'spare_part_id is required'; end if;

      select * into v_sp from public.spare_parts where id = v_spare_part_id for update;
      if not found then raise exception 'spare_part id not found: %', v_spare_part_id; end if;
      if v_sp.stock_quantity < v_qty then
        raise exception 'insufficient stock: % (have %, need %)', coalesce(v_sp.item_code, v_sp.id::text), v_sp.stock_quantity, v_qty;
      end if;

      update public.spare_parts
      set stock_quantity = stock_quantity - v_qty,
          last_updated = now()
      where id = v_spare_part_id;

      insert into public.receipt_lines (
        receipt_id, line_type, spare_part_id, description, quantity, unit_price
      ) values (
        v_receipt_id, 'spare_part', v_spare_part_id, coalesce(v_sp.item_name, v_sp.item_code, 'Blank'), v_qty, v_unit_price
      );

    elsif v_type = 'service' or v_type = 'custom' then
      if v_desc is null then v_desc := 'Blank'; end if;
      insert into public.receipt_lines (
        receipt_id, line_type, description, quantity, unit_price
      ) values (
        v_receipt_id, v_type, v_desc, v_qty, v_unit_price
      );

    else
      raise exception 'invalid line type: %', v_type;
    end if;
  end loop;

  return v_receipt_id;
end;
$$;

-- Daily usage report
create or replace function public.report_daily_usage(p_date date)
returns table (
  item_code text,
  item_name text,
  total_quantity bigint,
  total_value numeric
)
language sql
as $$
  select
    t.item_code,
    t.item_name,
    sum(t.quantity_used)::bigint as total_quantity,
    sum(t.total_price)::numeric as total_value
  from public.transactions t
  where t.date = p_date
  group by t.item_code, t.item_name
  order by total_quantity desc, item_code asc;
$$;

-- Most used items report (all-time)
create or replace function public.report_most_used(p_limit integer default 10)
returns table (
  item_code text,
  item_name text,
  total_quantity bigint
)
language sql
as $$
  select
    t.item_code,
    t.item_name,
    sum(t.quantity_used)::bigint as total_quantity
  from public.transactions t
  group by t.item_code, t.item_name
  order by total_quantity desc, item_code asc
  limit greatest(1, coalesce(p_limit, 10));
$$;

-- Profiles (Supabase Auth users) + default role
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'Staff' check (role in ('Admin', 'Staff')),
  first_name text,
  phone text,
  provider_type text,
  created_at timestamptz not null default now()
);

-- If you already created the table, add new columns safely.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists provider_type text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'Staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_auth_user();

-- Limit total auth users (registrations)
create or replace function public.prevent_more_than_three_users()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_count integer;
begin
  -- Serialize signups to avoid race conditions.
  perform pg_advisory_xact_lock(740201);

  select count(*)::integer into v_count from auth.users;
  if v_count >= 3 then
    raise exception 'Registration is closed: user limit reached (3).';
  end if;

  return new;
end;
$$;

drop trigger if exists limit_auth_users_to_three on auth.users;
create trigger limit_auth_users_to_three
before insert on auth.users
for each row
execute procedure public.prevent_more_than_three_users();
