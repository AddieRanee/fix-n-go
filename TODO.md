# Fix Supabase JSON Error on Vercel Deploy (ReceiptPage)

**Vercel-Specific Issue**

Local dev works (if schema applied), but Vercel serverless needs:

## Diagnosis
Error \"Cannot coerce the result to a single JSON object\" on cash bill (ReceiptPage.tsx) means Supabase query response is not valid JSON (likely HTML error page from RLS violation or missing data/tables).

## Steps to Fix

### 1. **Vercel Deploy Fix (Primary)**

**Add Environment Variables to Vercel Dashboard:**
- Go to Vercel Project Settings → Environment Variables
- Add (from your local .env files):
  ```
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-public-key
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
  CORS_ORIGIN=your-vercel-domain.com
  JWT_SECRET=your-long-jwt-secret
  ```
- **Redeploy** after adding.

**Apply Supabase Schema:**
- Supabase Dashboard → SQL Editor
- Paste **entire** `supabase/schema.sql` → RUN
- Verify: Tables `receipts`, `receipt_lines`; Functions like `add_inventory_stock`

### 2. Test Local First
```
npm run dev
```
- Backend: http://localhost:4000
- Frontend: http://localhost:5173 (Vite)

### 2. Login
- Go to http://localhost:5173/login
- Default user: Create or use existing (max 3 users per Supabase policy).

### 3. Apply Schema to Supabase
- Login Supabase dashboard (your project).
- SQL Editor → Copy/paste ALL of `supabase/schema.sql` → Run.
- Verify tables: receipts, receipt_lines, inventory, spare_parts, transactions.
- Verify Functions (RPC): add_inventory_stock, add_spare_part_stock_by_id, etc.

### 4. Create Test Data
Use backend seed or manual:
```
cd backend
npm run seed
```
Or create receipt via app: Navigate Inventory → Add item → Use InventoryPage.

### 5. Test Receipt Flow
- Go to SalesPage or UseInventoryPage → Create receipt.
- Click receipt link → Should load without error.
- If fails, check browser console → Note failing query.

### 6. Debug RLS/Auth
- Console: Check if `supabase.auth.getUser()` succeeds.
- Supabase Dashboard → Authentication → Users (verify logged in).
- Database → receipts table → View data (confirm RLS allows).

### 7. Check Logs
```
tail -f backend-start.log
```
Look for Supabase errors.

### 8. If Still Fails
- Verify .env files:
  - frontend/.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
  - backend/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- Test query in Supabase SQL Editor:
```
select * from receipts limit 1;
```
As authenticated user.

### 9. **Vercel-Specific Checks**
- `vercel.json` correct (api/ → serverless).
- `api/index.ts` loads backend app OK.
- Logs: Vercel Dashboard → Functions → Logs (check Supabase connection).

## Success Criteria
- Vercel site: ReceiptPage loads (login → create receipt → view).
- No browser console JSON error.
- Vercel Function logs clean (no Supabase auth/env errors).

**Next:** Mark steps ✅ as completed. Reply with updates/logs.

