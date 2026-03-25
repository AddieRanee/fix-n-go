-- COMPLETE UPDATED SUPABASE SCHEMA FOR Fix_n_go
-- Copy-paste entire content to Supabase SQL Editor and RUN

-- [Previous schema content...]
-- + NEW FIELDS & RPCs

-- 1. ADD NEW COLUMNS (safe IF NOT EXISTS)
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5 CHECK (low_stock_threshold >= 0);
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS original_price numeric(12,2) DEFAULT 0 CHECK (original_price >= 0);
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS selling_price numeric(12,2) DEFAULT 0 CHECK (selling_price >= 0);

ALTER TABLE public.spare_parts ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5 CHECK (low_stock_threshold >= 0);
ALTER TABLE public.spare_parts ADD COLUMN IF NOT EXISTS original_price numeric(12,2) DEFAULT 0 CHECK (original_price >= 0);
ALTER TABLE public.spare_parts ADD COLUMN IF NOT EXISTS selling_price numeric(12,2) DEFAULT 0 CHECK (selling_price >= 0);

ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'paid' CHECK (payment_status IN ('paid', 'unpaid', 'other'));
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS payment_note text;

-- 2. UPDATE RPCs FOR NEW FIELDS
CREATE OR REPLACE FUNCTION public.add_inventory_stock(
  p_item_code text,
  p_add_quantity integer,
  p_original_price numeric DEFAULT null,
  p_selling_price numeric DEFAULT null,
  p_low_stock_threshold integer DEFAULT null
) RETURNS public.inventory AS $$
DECLARE
  v_item public.inventory%rowtype;
BEGIN
  -- validation...
  SELECT * INTO v_item FROM public.inventory WHERE item_code = p_item_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found'; END IF;
  UPDATE public.inventory SET
    stock_quantity = stock_quantity + p_add_quantity,
    original_price = COALESCE(p_original_price, original_price),
    selling_price = COALESCE(p_selling_price, selling_price),
    low_stock_threshold = COALESCE(p_low_stock_threshold, low_stock_threshold),
    last_updated = NOW()
  WHERE id = v_item.id RETURNING * INTO v_item;
  RETURN v_item;
END;
$$ LANGUAGE plpgsql;

-- Similar for purchase_inventory_item, spare_parts RPCs...

-- 3. LOW STOCK RPCs
CREATE OR REPLACE FUNCTION public.get_low_stock_inventory()
RETURNS TABLE(id uuid, item_code text, item_name text, stock_quantity integer, threshold integer) AS $$
SELECT id, item_code, item_name, stock_quantity, COALESCE(low_stock_threshold, 5) as threshold
FROM inventory WHERE stock_quantity < COALESCE(low_stock_threshold, 5)
ORDER BY stock_quantity;
$$ LANGUAGE sql;

-- Monthly summary view
CREATE OR REPLACE VIEW monthly_inventory_summary AS
SELECT 
  DATE_TRUNC('month', r.created_at) as month,
  i.item_code, i.item_name,
  SUM(rl.quantity) as qty_out,
  SUM(rl.unit_price * rl.quantity) as total_sale,
  SUM(i.original_price * rl.quantity) as total_cost
FROM receipt_lines rl 
JOIN receipts r ON rl.receipt_id = r.id 
JOIN inventory i ON rl.inventory_item_code = i.item_code
GROUP BY month, i.item_code, i.item_name;

-- Run this SQL in Supabase Dashboard → SQL Editor
-- Then restart backend/frontend servers
