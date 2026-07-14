import { describe, expect, it } from "vitest";
import { POST as confirmPayment } from "../app/api/admin/orders/[reportCode]/confirm-payment/route";
import { POST as refund } from "../app/api/admin/orders/[reportCode]/refund/route";
import { PATCH as updateNotes } from "../app/api/admin/orders/[reportCode]/notes/route";

describe("legacy payment routes", () => {
  it("are permanently read-only and cannot control free reports", async () => {
    expect((await confirmPayment()).status).toBe(410);
    expect((await refund()).status).toBe(410);
    expect((await updateNotes()).status).toBe(410);
  });
});
