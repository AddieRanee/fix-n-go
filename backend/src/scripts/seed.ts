import "dotenv/config";
import { loadEnv } from "../config/env.js";
import { createSupabaseAdminClient } from "../services/supabase.js";

const env = loadEnv(process.env);
const supabase = createSupabaseAdminClient(env);

function makeInventoryItems() {
  const categories = ["Oil", "Filter", "Brake", "Electrical", "Engine", "Tyre"];
  const items = [];
  for (let i = 1; i <= 25; i += 1) {
    const code = `ITM${String(i).padStart(3, "0")}`;
    const category = categories[i % categories.length];
    items.push({
      item_code: code,
      item_name: `${category} Part ${i}`,
      category,
      stock_quantity: 3 + (i % 14),
      price: Number((8 + (i % 10) * 2 + i * 0.15).toFixed(2)),
      last_updated: new Date().toISOString()
    });
  }
  return items;
}

async function upsertInventory() {
  const items = makeInventoryItems();
  const { error } = await supabase
    .from("inventory")
    .upsert(items, { onConflict: "item_code" });
  if (error) throw new Error(`Failed to upsert inventory: ${error.message}`);
}

async function upsertSampleReceipts() {
  const receipts = [
    {
      job_id: "J00001",
      number_plate: "WXY1234",
      staff_name: "Alice",
      lines: [
        { type: "inventory", item_code: "ITM001", qty: 2 },
        { type: "service", description: "Oil change", qty: 1, unit_price: 80 }
      ]
    },
    {
      job_id: "J00002",
      number_plate: "ABC5678",
      staff_name: "Bob",
      lines: [
        { type: "inventory", item_code: "ITM002", qty: 1 },
        { type: "service", description: "Brake check", qty: 1, unit_price: 50 }
      ]
    },
    {
      job_id: "J00003",
      number_plate: "XYZ9999",
      staff_name: "Charlie",
      lines: [
        { type: "inventory", item_code: "ITM003", qty: 3 },
        { type: "service", description: "Tire rotation", qty: 1, unit_price: 40 }
      ]
    }
  ];

  for (const r of receipts) {
    const { data } = await supabase
      .from("receipts")
      .select("id")
      .eq("job_id", r.job_id)
      .single();
    if (data) continue;

    const { error } = await supabase.rpc("create_receipt", {
      p_job_id: r.job_id,
      p_number_plate: r.number_plate,
      p_staff_name: r.staff_name,
      p_lines: r.lines
    });
    if (error) throw new Error(`Failed to create receipt ${r.job_id}: ${error.message}`);
  }
}

async function main() {
  await upsertInventory();
  await upsertSampleReceipts();
  // eslint-disable-next-line no-console
  console.log("Seed complete: inventory + transactions");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
