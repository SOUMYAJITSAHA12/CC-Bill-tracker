import { NextResponse } from "next/server";
import { getAppSupabase } from "@/lib/db";
import { isAuthSkipped } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import type { BillStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthSkipped()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const status = body.status as BillStatus | undefined;
  const amountPaidRaw = body.amount_paid;

  if (!status || !["PAID", "PARTIAL", "UNPAID"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabase = await getAppSupabase();
  const { data: bill, error: loadErr } = await supabase
    .from("bills")
    .select("id, amount, status, card_id, due_date")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const total = Number(bill.amount);
  const now = new Date().toISOString();

  if (status === "UNPAID") {
    if (bill.status === "UNPAID") {
      return NextResponse.json({ error: "Bill is already unpaid" }, { status: 400 });
    }

    await supabase
      .from("bills")
      .delete()
      .eq("card_id", bill.card_id)
      .eq("due_date", bill.due_date)
      .eq("status", "PAID")
      .neq("id", id);

    const { data: existingUnpaid } = await supabase
      .from("bills")
      .select("id")
      .eq("card_id", bill.card_id)
      .eq("due_date", bill.due_date)
      .eq("status", "UNPAID")
      .neq("id", id)
      .limit(1);

    if (existingUnpaid?.length) {
      const { error: delErr } = await supabase.from("bills").delete().eq("id", id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, status: "UNPAID", merged: true });
    }

    const { error } = await supabase
      .from("bills")
      .update({ status: "UNPAID", amount_paid: 0, paid_at: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "UNPAID" });
  }

  if (status === "PAID") {
    const { error } = await supabase
      .from("bills")
      .update({ status: "PAID", amount_paid: total, paid_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("bills")
      .delete()
      .eq("card_id", bill.card_id)
      .eq("due_date", bill.due_date)
      .eq("status", "UNPAID")
      .neq("id", id);
    return NextResponse.json({ ok: true });
  }

  const amountPaid = Number(amountPaidRaw);
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return NextResponse.json({ error: "amount_paid must be a positive number" }, { status: 400 });
  }
  if (amountPaid >= total) {
    const { error } = await supabase
      .from("bills")
      .update({ status: "PAID", amount_paid: total, paid_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("bills")
      .delete()
      .eq("card_id", bill.card_id)
      .eq("due_date", bill.due_date)
      .eq("status", "UNPAID")
      .neq("id", id);
    return NextResponse.json({ ok: true, status: "PAID" });
  }

  const { error } = await supabase
    .from("bills")
    .update({ status: "PARTIAL", amount_paid: amountPaid, paid_at: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: "PARTIAL", amount_paid: amountPaid });
}
