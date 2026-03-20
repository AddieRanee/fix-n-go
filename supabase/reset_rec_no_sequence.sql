-- Reset the rec_no sequence to start from 1000
-- This ensures that the next receipt will be numbered 1000, 1001, 1002, etc.

-- First, check the highest rec_no that exists
SELECT max(rec_no) as highest_rec_no FROM public.receipts;

-- Reset the sequence to start from 1000
ALTER SEQUENCE public.receipts_rec_no_seq RESTART WITH 1000;

-- Verify the sequence was reset
SELECT last_value, is_called FROM public.receipts_rec_no_seq;
