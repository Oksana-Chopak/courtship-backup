// Courts data access: picker fetch, custom-court creation guards, admin ops,
// and the display shortener.
import { describe, it, expect, beforeEach, vi } from "vitest";

const state: {
  pickerRows: unknown[] | null;
  insert: { data?: unknown; error?: { message: string } | null };
  user: { id: string } | null;
  rpc: ReturnType<typeof vi.fn>;
} = { pickerRows: [], insert: {}, user: null, rpc: vi.fn() };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }), getSession: () => Promise.resolve({ data: { session: state.user ? { user: state.user } : null }, error: null }) },
    rpc: (...a: unknown[]) => state.rpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: state.pickerRows }) }) }),
      }),
      insert: (row: unknown) => ({
        select: () => ({ single: () => Promise.resolve({ data: state.insert.data ?? row, error: state.insert.error ?? null }) }),
      }),
    }),
  },
}));

import { fetchCourtsForPicker, addCustomCourt, adminListCustomCourts, adminSetCourtHidden, adminUpdateCourt, shortCourtName } from "./courts";

beforeEach(() => {
  state.pickerRows = [];
  state.insert = {};
  state.user = null;
  state.rpc = vi.fn();
});

describe("shortCourtName", () => {
  it("shortens the two big clubs case-insensitively, passes others through", () => {
    expect(shortCourtName("USIF Tenniscenter")).toBe("USIF");
    expect(shortCourtName("usif hall")).toBe("USIF");
    expect(shortCourtName("UTK-hallen")).toBe("UTK");
    expect(shortCourtName("Fyrishov")).toBe("Fyrishov");
  });
});

describe("fetchCourtsForPicker", () => {
  it("returns rows and tolerates null data", async () => {
    state.pickerRows = [{ id: "c1", name: "USIF", area: null, city: "Uppsala", is_custom: false, hidden: false, created_by: null }];
    expect((await fetchCourtsForPicker())[0].id).toBe("c1");
    state.pickerRows = null;
    expect(await fetchCourtsForPicker()).toEqual([]);
  });
});

describe("addCustomCourt", () => {
  it("refuses signed-out users", async () => {
    await expect(addCustomCourt({ name: "X", area: null, city: "Uppsala" })).rejects.toThrow("Not signed in");
  });
  it("trims fields, nulls empty area and returns the row", async () => {
    state.user = { id: "u1" };
    const row = await addCustomCourt({ name: "  My Court ", area: "  ", city: "Uppsala" });
    expect(row).toMatchObject({ name: "My Court", area: null, city: "Uppsala", is_custom: true, created_by: "u1", hidden: false });
  });
  it("surfaces insert errors as thrown messages", async () => {
    state.user = { id: "u1" };
    state.insert = { error: { message: "duplicate court" } };
    await expect(addCustomCourt({ name: "X", area: "A", city: "Uppsala" })).rejects.toThrow("duplicate court");
  });
});

describe("admin ops", () => {
  it("list returns data and throws on error", async () => {
    state.rpc.mockResolvedValueOnce({ data: [{ id: "c1" }], error: null });
    expect(await adminListCustomCourts()).toHaveLength(1);
    state.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await adminListCustomCourts()).toEqual([]);
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: "forbidden" } });
    await expect(adminListCustomCourts()).rejects.toThrow("forbidden");
  });
  it("hide/update pass args through and throw on error", async () => {
    state.rpc.mockResolvedValue({ error: null });
    await adminSetCourtHidden("c1", true);
    expect(state.rpc).toHaveBeenCalledWith("admin_set_court_hidden", { _court_id: "c1", _hidden: true });
    await adminUpdateCourt("c1", "New", "Area");
    expect(state.rpc).toHaveBeenCalledWith("admin_update_court", { _court_id: "c1", _name: "New", _area: "Area" });
    state.rpc.mockResolvedValueOnce({ error: { message: "nope" } });
    await expect(adminSetCourtHidden("c1", false)).rejects.toThrow("nope");
    state.rpc.mockResolvedValueOnce({ error: { message: "nope2" } });
    await expect(adminUpdateCourt("c1", "N", "A")).rejects.toThrow("nope2");
  });
});
