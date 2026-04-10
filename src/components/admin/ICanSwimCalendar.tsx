import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, MapPin, Loader2, RefreshCw, Database, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface LocalEvent {
  id: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  pool_area: string;
  instructor_name: string | null;
  notes: string | null;
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

function formatLocalTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
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

function groupLocalByDate(events: LocalEvent[]): Record<string, LocalEvent[]> {
  const groups: Record<string, LocalEvent[]> = {};
  events.forEach((e) => {
    const d = new Date(e.event_date + "T00:00:00");
    const dateKey = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(e);
  });
  return groups;
}

const STORAGE_KEY = "ics-data-source";

const ICanSwimCalendar = () => {
  const [dataSource, setDataSource] = useState<"airtable" | "supabase">(() => {
    return (localStorage.getItem(STORAGE_KEY) as "airtable" | "supabase") || "airtable";
  });
  const [sessions, setSessions] = useState<ICSSession[]>([]);
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = () => {
    const next = dataSource === "airtable" ? "supabase" : "airtable";
    setDataSource(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const fetchAirtableSessions = async () => {
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

  const fetchLocalEvents = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("pool_events")
      .select("id, title, event_date, start_time, end_time, pool_area, instructor_name, notes")
      .eq("event_type", "i-can-swim")
      .gte("event_date", new Date().toISOString().split("T")[0])
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setLocalEvents(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (dataSource === "airtable") {
      fetchAirtableSessions();
    } else {
      fetchLocalEvents();
    }
  }, [dataSource]);

  const refresh = () => {
    if (dataSource === "airtable") fetchAirtableSessions();
    else fetchLocalEvents();
  };

  const airtableGrouped = groupByDate(sessions);
  const localGrouped = groupLocalByDate(localEvents);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          🏊 I Can Swim 209 Schedule
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={dataSource === "supabase" ? "default" : "secondary"} className="text-[10px]">
            {dataSource === "supabase" ? "New Database" : "Airtable"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSource}
            className="text-xs gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Switch to {dataSource === "airtable" ? "New I CAN SWIM Database" : "Airtable"}
          </Button>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {dataSource === "supabase" && (
          <Alert className="mb-4">
            <Database className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Using the new database. Add I Can Swim events via the "Add Event" button above with type "I Can Swim 209".
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : dataSource === "airtable" ? (
          // Airtable view (existing)
          sessions.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">No upcoming sessions</p>
          ) : (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
              {Object.entries(airtableGrouped).map(([date, dateSessions]) => (
                <div key={date}>
                  <h4 className="text-sm font-semibold text-foreground mb-2 sticky top-0 bg-card py-1">
                    {date}
                  </h4>
                  <div className="space-y-2">
                    {dateSessions.map((s) => (
                      <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
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
                              <span className="flex items-center gap-1">👤 {s.instructor_name}</span>
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
          )
        ) : (
          // Supabase / new database view
          localEvents.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">
              No upcoming I Can Swim events. Add them using the "Add Event" button above.
            </p>
          ) : (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
              {Object.entries(localGrouped).map(([date, dateEvents]) => (
                <div key={date}>
                  <h4 className="text-sm font-semibold text-foreground mb-2 sticky top-0 bg-card py-1">
                    {date}
                  </h4>
                  <div className="space-y-2">
                    {dateEvents.map((e) => (
                      <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {formatLocalTime(e.start_time)} – {formatLocalTime(e.end_time)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {e.instructor_name && (
                              <span className="flex items-center gap-1">👤 {e.instructor_name}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {e.pool_area === "shallow" ? "Shallow End" : e.pool_area === "deep" ? "Deep End" : "Full Pool"}
                            </span>
                            {e.notes && (
                              <span className="truncate max-w-[200px]">{e.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default ICanSwimCalendar;
