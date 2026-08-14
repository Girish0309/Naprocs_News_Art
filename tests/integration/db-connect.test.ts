import { describe, it, expect } from "vitest";
import dbConnect from "@/lib/db";

// T-007
describe("dbConnect", () => {
  it("returns the same cached connection object on repeated calls", async () => {
    const first = await dbConnect();
    const second = await dbConnect();
    expect(second).toBe(first);
    expect(first.connection.readyState).toBe(1); // 1 = connected
  });
});
