/** Stored values; they match the `guests` table check constraints. */
export const GUEST_CATEGORIES = ["adult", "child", "infant"] as const;
export type GuestCategory = (typeof GUEST_CATEGORIES)[number];

/** Stored side; `null` on a guest means "Non indicato". */
export const GUEST_SIDES = ["A", "B", "both"] as const;
export type GuestSide = (typeof GUEST_SIDES)[number];

export const CATEGORY_LABELS: Record<GuestCategory, string> = {
  adult: "Adulto",
  child: "Bambino",
  infant: "Neonato (0-2 anni)",
};

export type Guest = {
  id: string;
  firstName: string;
  lastName: string | null;
  category: GuestCategory;
  side: GuestSide | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  groupId: string | null;
  tableId: string | null;
  /** Soft delete: a deleted guest is never counted, listed or exported. */
  deletedAt: string | null;
};

export type GuestGroup = { id: string; name: string; deletedAt: string | null };

export type GuestTable = {
  id: string;
  name: string;
  capacity: number | null;
  deletedAt: string | null;
};

export type GuestCounts = { total: number; adult: number; child: number; infant: number };

/** Side bucket for counts and filters: `none` = "Senza lato" / "Non indicato". */
export type SideKey = GuestSide | "none";
