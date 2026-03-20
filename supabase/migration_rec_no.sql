-- Migration: Add rec_no column and remove job_id from receipts table

-- Step 1: Check if rec_no column already exists, if not add it
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'receipts' and column_name = 'rec_no'
  ) then
    -- Add rec_no column with auto-increment starting from 1000
    alter table public.receipts 
    add column rec_no serial unique;
    
    -- Set the sequence to start at 1000 for future inserts
    alter sequence public.receipts_rec_no_seq restart with 1000;
    
    raise notice 'Added rec_no column to receipts table';
  else
    raise notice 'rec_no column already exists';
  end if;
end $$;

-- Step 2: Check if job_id column exists, if yes drop it
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'receipts' and column_name = 'job_id'
  ) then
    -- Drop the old job_id column
    alter table public.receipts 
    drop column if exists job_id;
    
    raise notice 'Dropped job_id column from receipts table';
  else
    raise notice 'job_id column does not exist';
  end if;
end $$;

-- Step 3: Update indexes - drop old index if exists, add new one
drop index if exists public.idx_receipts_job_id;

create index if not exists idx_receipts_rec_no on public.receipts (rec_no);

-- Step 4: Update the create_receipt function to remove p_job_id parameter
-- This will be done separately as it requires dropping and recreating the function

do $$
begin
  raise notice 'Migration completed: rec_no column is ready, rec_no values start from next auto-increment number';
end $$;
