import { describe, it, expect } from "vitest";
import { groupFamilyMatches, type FamilyMatch } from "@/hooks/useFamilySearch";

const m = (p: Partial<FamilyMatch>): FamilyMatch => ({
  parent_name: "Ana Diaz",
  parent_email: null,
  parent_phone: "209-555-0134",
  swimmer_name: "Mia Diaz",
  child_dob: null,
  source: "booking",
  ...p,
});

describe("groupFamilyMatches", () => {
  it("returns one entry per phone with a swimmer array", () => {
    const out = groupFamilyMatches([
      m({ swimmer_name: "Mia Diaz" }),
      m({ swimmer_name: "Leo Diaz" }),
      m({ parent_phone: "(209) 555-9999", swimmer_name: "Sam Ruiz", parent_name: "Bea Ruiz" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].swimmers.map((s) => s.swimmer_name)).toEqual(["Mia Diaz", "Leo Diaz"]);
  });

  it("collapses one swimmer under two emails, keeping the DOB entry", () => {
    const out = groupFamilyMatches([
      m({ parent_email: "a@x.com", source: "membership", child_dob: null }),
      m({ parent_phone: "12095550134", parent_email: "b@x.com", source: "enrollment", child_dob: "2018-04-02" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].swimmers).toHaveLength(1);
    expect(out[0].swimmers[0].child_dob).toBe("2018-04-02");
    expect(out[0].parent_emails).toEqual(["a@x.com", "b@x.com"]);
  });

  it("breaks DOB ties by source priority", () => {
    const out = groupFamilyMatches([
      m({ source: "request" }),
      m({ source: "membership" }),
    ]);
    expect(out[0].swimmers[0].source).toBe("membership");
  });
});
