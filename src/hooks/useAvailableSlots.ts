import { useEffect, useState } from "react";

export interface AvailableSlot {
  instructorId: string;
  instructorName: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  poolArea: string;
}

interface Options {
  lengthMin: number;
  stepMin?: number;
  poolArea?: string;
}

/**
 * Instructor shift scheduling has been removed from this app, so there is no
 * longer a source for suggested open slots. The hook keeps its public shape
 * so existing consumers compile, but always returns an empty slot list.
 */
export function useAvailableSlots(
  _date: Date | null,
  _options: Options,
) {
  const [slots] = useState<AvailableSlot[]>([]);
  useEffect(() => {
    // no-op: scheduling source removed
  }, []);
  return { slots, loading: false, hasAnyShift: false };
}
