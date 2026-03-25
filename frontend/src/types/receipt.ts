export type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  stock_quantity: number;
  price: number;
};

export type SparePartItem = {
  id: string;
  item_code?: string;
  item_name: string;
  company?: string;
  price: number;
  stock_quantity: number;
};

export type ReceiptLine = {
  id: string;
  type: "inventory" | "spare_part" | "service" | "custom";
  item_code?: string; // inventory
  item_name?: string; // inventory
  spare_part_id?: string; // spare_part
  description?: string; // service/custom
  qty: number;
  unit_price?: string; // keep as text so blank is allowed
};

export type ReceiptDetail = {
  receipt: {
    id: string;
    job_id: string;
    rec_no?: number | null;
    number_plate: string;
    staff_name: string;
    created_at: string;
  };
  lines: {
    id: string;
    line_type: "inventory" | "service" | "custom";
    inventory_item_code: string | null;
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
  }[];
};

export type ReceiptEditOriginalLine = {
  line_type: "inventory" | "spare_part" | "service" | "custom";
  inventory_item_code: string | null;
  spare_part_id: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
};

export type ReceiptEditOriginalReceipt = {
  number_plate: string;
  staff_name: string;
  payment_status: "paid" | "unpaid" | "other";
  payment_note: string;
} | null;

