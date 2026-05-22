/**
 * BillDesk InstaPay OPERATIONID values (from main.*.js).
 */
export const OP = {
  INIT: "NLIINIT",
  BILLER_CATEGORIES: "NLIBILLERCATEGORIES",
  BILLERS: "NLIBILLERS",
  /** Smart search (Credit Card etc.) — min 3 chars */
  BILLER_SEARCH: "NLIBILLERLSSEARCH",
  CIRCLES: "NLICIRCLES",
  /** Get bill — Pre Login uses NLIVALIDATEPAYMENT (not NLIFETCHBILL) */
  VALIDATE_PAYMENT: "NLIVALIDATEPAYMENT",
  RETRIEVE_BILLER: "RETRIEVEBILLER",
} as const;

export type OperationId = (typeof OP)[keyof typeof OP];
