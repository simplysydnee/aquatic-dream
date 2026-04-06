import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, MapPin, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ICSSession {
  id: string;
  start_time: string;
  end_time: string;
  location: string;
  session_type: string;
  status: string;
  max_capacity: number;
  instructor_name: string | null;
  confirmed_bookings: number;
}

function formatTimeLA(utcStr: string) {
  const d = new Date(utcStr);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateLA(utcStr: string) {
  const d = new Date(utcStr);
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupByDate(sessions: ICSSession[]): Record<string, ICSSession[]> {
  const groups: Record<string, ICSSession[]> = {};
  sessions.forEach((s) => {
    const dateKey = formatDateLA(s.start_time);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(s);
  });
  return groups;
}

const ICanSwimCalendar = () => {
  const [sessions, setSessions] = useState<ICSSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("i-can-swim-schedule");
      if (fnError) {
        setError(fnError.message);
      } else if (data?.sessions) {
        setSessions(data.sessions);
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const grouped = groupByDate(sessions);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          🏊 I Can Swim 209 Schedule
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={fetchSessions} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchSessions}>
              Retry
            </Button>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">No upcoming sessions</p>
        ) : (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            {Object.entries(grouped).map(([date, dateSessions]) => (
              <div key={date}>
                <h4 className="text-sm font-semibold text-foreground mb-2 sticky top-0 bg-card py-1">
                  {date}
                </h4>
                <div className="space-y-2">
                  {dateSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {formatTimeLA(s.start_time)} – {formatTimeLA(s.end_time)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {s.session_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {s.instructor_name && (
                            <span className="flex items-center gap-1">
                              👤 {s.instructor_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {s.location || "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {s.confirmed_bookings}/{s.max_capacity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ICanSwimCalendar;
