import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminBadgeCounts {
  newLessonRequests: number;
  newContacts: number;
  newGroupEnrollments: number;
  newPrivateBookings: number;
}

const REFRESH_MS = 60_000;

export function useAdminBadgeCounts(): AdminBadgeCounts {
  const [counts, setCounts] = useState<AdminBadgeCounts>({
    newLessonRequests: 0,
    newContacts: 0,
    newGroupEnrollments: 0,
    newPrivateBookings: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [lr, ci, ge, pb] = await Promise.all([
        supabase.from("lesson_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("swim_enrollments").select("id", { count: "exact", head: true }).is("admin_reviewed_at", null).eq("status", "confirmed"),
        supabase.from("lesson_bookings").select("id", { count: "exact", head: true }).is("admin_reviewed_at", null).eq("status", "active"),
      ]);
      if (cancelled) return;
      setCounts({
        newLessonRequests: lr.count ?? 0,
        newContacts: ci.count ?? 0,
        newGroupEnrollments: ge.count ?? 0,
        newPrivateBookings: pb.count ?? 0,
      });
    };

    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return counts;
}

