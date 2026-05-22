import { NextResponse } from "next/server";
import { fetchBillForCard } from "@/lib/billdesk/client";

/**
 * Test BillDesk fetch without Supabase.
 * GET /api/fetch/test?bank=axis&mobile=9735259622&last4=6402
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bank = searchParams.get("bank") ?? "axis";
  const mobile = searchParams.get("mobile");
  const last4 = searchParams.get("last4");

  if (!mobile || !last4) {
    return NextResponse.json(
      {
        error: "Query params required: mobile, last4 (optional: bank)",
        example:
          "/api/fetch/test?bank=axis&mobile=9735259622&last4=6402",
      },
      { status: 400 }
    );
  }

  try {
    const result = await fetchBillForCard({ bank, mobile, last4 });
    return NextResponse.json({ bank, mobile, last4, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
