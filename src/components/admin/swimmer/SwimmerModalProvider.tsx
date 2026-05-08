import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSwimmers, type Swimmer } from "@/hooks/useSwimmers";
import SwimmerDetailDrawer from "@/components/admin/clients/SwimmerDetailDrawer";
import LessonRequestDetailDialog, { type LessonRequest } from "@/components/admin/LessonRequestDetailDialog";
import EnrollmentDetailDialog from "@/components/admin/EnrollmentDetailDialog";
import { supabase } from "@/integrations/supabase/client";

type Identity = { child_name: string; parent_email: string };

interface SwimmerModalContext {
  open: (id: Identity) => void;
  close: () => void;
}

const Ctx = createContext<SwimmerModalContext | undefined>(undefined);

const keyOf = (i: Identity) =>
  `${i.child_name.trim().toLowerCase()}|${i.parent_email.trim().toLowerCase()}`;

export function SwimmerModalProvider({ children }: { children: ReactNode }) {
  const { swimmers } = useSwimmers();
  const [selected, setSelected] = useState<Swimmer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [activeRequest, setActiveRequest] = useState<LessonRequest | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  const [activeEnrollment, setActiveEnrollment] = useState<any | null>(null);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);

  const open = useCallback(
    (id: Identity) => {
      const k = keyOf(id);
      const found = swimmers.find((s) => s.key === k) || null;
      setSelected(found);
      setDrawerOpen(true);
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

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <Ctx.Provider value={value}>
      {children}

      <SwimmerDetailDrawer
        swimmer={selected}
        siblings={selected ? siblingsOf(selected) : []}
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
