import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminBadgeCounts {
  newLessonRequests: number;
  newContacts: number;
  newApplications: number;
}

const REFRESH_MS = 60_000;

export function useAdminBadgeCounts(): AdminBadgeCounts {
  const [counts, setCounts] = useState<AdminBadgeCounts>({
    newLessonRequests: 0,
    newContacts: 0,
    newApplications: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [lr, ci, ja] = await Promise.all([
        supabase.from("lesson_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("is_viewed", false),
      ]);
      if (cancelled) return;
      setCounts({
        newLessonRequests: lr.count ?? 0,
        newContacts: ci.count ?? 0,
        newApplications: ja.count ?? 0,
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
