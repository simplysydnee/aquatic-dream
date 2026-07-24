import { useEffect, useState } from "react";
import { fetchUpcomingClosures, formatClosureSchedule, type StudioClosure } from "@/lib/closureSchedule";

export function useClosureSchedule() {
  const [closures, setClosures] = useState<StudioClosure[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchUpcomingClosures()
      .then((rows) => {
        if (alive) setClosures(rows);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { closures, closureSchedule: formatClosureSchedule(closures), loading };
}
