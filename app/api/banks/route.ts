import { NextResponse } from "next/server";
import { BANK_BILLER_MAP, BANK_OPTIONS } from "@/lib/banks";

export async function GET() {
  return NextResponse.json({
    banks: BANK_OPTIONS.map((key) => ({
      key,
      billerName: BANK_BILLER_MAP[key].name,
    })),
  });
}
