import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSwimmers, type Swimmer } from "@/hooks/useSwimmers";
import SwimmerDetailDrawer from "@/components/admin/clients/SwimmerDetailDrawer";
import LessonRequestDetailDialog, { type LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import EnrollmentDetailDialog from "@/components/admin/EnrollmentDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Identity = { child_name: string; parent_email: string };

type SwimmerTab = "overview" | "activity" | "compliance" | "payments" | "comms" | "notes";

interface SwimmerModalContext {
  open: (id: Identity, tab?: SwimmerTab) => void;
  /** Opens the family whose parent phone matches. Returns false when unknown. */
  openByPhone: (phone: string, tab?: SwimmerTab) => boolean;
  close: () => void;
}

const last10 = (raw: string | null | undefined) => (raw || "").replace(/\D/g, "").slice(-10);

const Ctx = createContext<SwimmerModalContext | undefined>(undefined);

const keyOf = (i: Identity) =>
  `${i.child_name.trim().toLowerCase()}|${i.parent_email.trim().toLowerCase()}`;

export function SwimmerModalProvider({ children }: { children: ReactNode }) {
  const { swimmers } = useSwimmers();
  const [selected, setSelected] = useState<Swimmer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [initialTab, setInitialTab] = useState<SwimmerTab>("overview");

  const [activeRequest, setActiveRequest] = useState<LessonRequest | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  const [activeEnrollment, setActiveEnrollment] = useState<any | null>(null);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);

  const open = useCallback(
    async (id: Identity, tab: SwimmerTab = "overview") => {
      setInitialTab(tab);
      const k = keyOf(id);
      const found = swimmers.find((s) => s.key === k) || null;
      if (found) {
        setSelected(found);
        setDrawerOpen(true);
        return;
      }

      // Fallback: swimmers list may not have loaded yet (slow network on
      // tablets) or this swimmer comes from a lesson_booking that hasn't
      // been merged into the swimmers view. Try a direct lookup so the
      // tap doesn't appear to do nothing.
      const email = id.parent_email.trim();
      const name = id.child_name.trim();

      try {
        const [enrRes, bookRes] = await Promise.all([
          email
            ? supabase
                .from("swim_enrollments")
                .select("*")
                .ilike("parent_email", email)
                .ilike("child_name", name)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
          email
            ? supabase
                .from("lesson_bookings")
                .select("*")
                .ilike("parent_email", email)
                .limit(1)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);

        const enr = (enrRes as any)?.data;
        const book = (bookRes as any)?.data;
        const source = enr || book;
        if (source) {
          const stub: Swimmer = {
            key: k,
            child_name: source.child_name || name,
            child_age: source.child_age ?? null,
            child_dob: source.child_dob ?? null,
            parent_name: source.parent_name || "",
            parent_email: source.parent_email || email,
            parent_phone: source.parent_phone || null,
            swim_level: null,
            requests: [],
            enrollments: [],
            bookings: [],
            statuses: [{ key: "unknown", label: "Profile loading…", tone: "info" }],
            last_activity: new Date().toISOString(),
            primary_status: { key: "unknown", label: "Profile loading…", tone: "info" },
          } as unknown as Swimmer;
          setSelected(stub);
          setDrawerOpen(true);
          return;
        }
      } catch (e) {
        console.error("SwimmerModalProvider fallback lookup failed:", e);
      }

      toast.error("Swimmer record not found", {
        description: "We couldn't find a profile for this person yet.",
      });
    },
    [swimmers],
  );

  const openByPhone = useCallback(
    (phone: string, tab: SwimmerTab = "overview") => {
      const digits = last10(phone);
      if (!digits) return false;
      const match = swimmers.find((s) => last10(s.parent_phone) === digits);
      if (!match) return false;
      setInitialTab(tab);
      setSelected(match);
      setDrawerOpen(true);
      return true;
    },
    [swimmers],
  );

  const close = useCallback(() => setDrawerOpen(false), []);

  const siblingsOf = (s: Swimmer) =>
    swimmers.filter(
      (x) => x.parent_email.toLowerCase() === s.parent_email.toLowerCase() && x.key !== s.key,
    );

  const onOpenRequest = async (id: string) => {
    const { data } = await supabase.from("lesson_requests").select("*").eq("id", id).maybeSingle();
    if (data) {
      setActiveRequest(data as LessonRequest);
      setReqOpen(true);
    }
  };

  const onOpenEnrollment = async (id: string) => {
    const { data } = await supabase.from("swim_enrollments").select("*").eq("id", id).maybeSingle();
    if (data) {
      setActiveEnrollment(data);
      setEnrollmentOpen(true);
    }
  };

  const value = useMemo(() => ({ open, openByPhone, close }), [open, openByPhone, close]);

  return (
    <Ctx.Provider value={value}>
      {children}

      <SwimmerDetailDrawer
        swimmer={selected}
        siblings={selected ? siblingsOf(selected) : []}
        initialTab={initialTab}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onOpenRequest={onOpenRequest}
        onOpenEnrollment={onOpenEnrollment}
        onSelectSwimmer={(s) => setSelected(s)}
      />

      <LessonRequestDetailDialog
        request={activeRequest}
        open={reqOpen}
        onOpenChange={setReqOpen}
        onUpdated={(r) => setActiveRequest(r)}
      />

      <EnrollmentDetailDialog
        enrollment={activeEnrollment}
        open={enrollmentOpen}
        onOpenChange={setEnrollmentOpen}
        onUpdated={(u) => setActiveEnrollment(u)}
      />
    </Ctx.Provider>
  );
}

export function useSwimmerModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSwimmerModal must be used within SwimmerModalProvider");
  return ctx;
}
