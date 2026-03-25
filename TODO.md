# Fix UseInventoryPage.tsx Errors - TODO

## Plan Steps:
1. ✅ [Complete] Create `frontend/src/types/receipt.ts` with extracted types (InventoryItem, SparePartItem, ReceiptLine, ReceiptDetail, ReceiptEditOriginalLine, ReceiptEditOriginalReceipt).  
2. ✅ [Complete] Refactor `frontend/src/pages/UseInventoryPage.tsx`:
   - Import new types.
   - Fix table dropdowns to use full `items`/`spareParts` lists consistently.
   - Remove duplicate `setItemSearch("")` calls.
   - Update UI titles to "Use Inventory" instead of "Receipts".
   - Add `payment_status` to receipts insert (already present).
3. 🔄 Run `cd frontend && npm run build` to verify no TS errors.

   - Import new types.
   - Fix table dropdowns to use full `items`/`spareParts` lists consistently.
   - Remove duplicate `setItemSearch("")` calls.
   - Update UI titles to "Use Inventory" instead of "Receipts".
   - Add `payment_status` to receipts insert.
3. Run `cd frontend && npm run build` to verify no TS errors.
4. Test functionality (manual: add items, submit receipt, check stock deduction).
5. Update this TODO.md with progress.
6. attempt_completion when done.

Current: Starting step 1.

