import { useState } from "react";
import { format, addDays, startOfWeek, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plus, ArrowRightLeft, Printer } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import CalendarDayView from "@/components/admin/calendar/CalendarDayView";
import CalendarWeekView from "@/components/admin/calendar/CalendarWeekView";
import AddPoolEventDialog from "@/components/admin/calendar/AddPoolEventDialog";
import PrintDayScheduleDialog from "@/components/admin/calendar/PrintDayScheduleDialog";
import CalendarFilterBar from "@/components/admin/calendar/CalendarFilterBar";
import type { ActivityType } from "@/components/admin/calendar/CalendarFilterBar";
import { Badge } from "@/components/ui/badge";
import { useCalendarData } from "@/hooks/useCalendarData";
import type { CalendarPoolEvent } from "@/hooks/useCalendarData";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const ALL_FILTERS: ActivityType[] = [
  "i-can-swim", "swim", "private-lesson", "semi-private-lesson", "dive-session", "pool-rental",
];

const CalendarAdmin = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("day");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarPoolEvent | null>(null);
  const [prefillStartTime, setPrefillStartTime] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<ActivityType>>(new Set(ALL_FILTERS));
  const [miniCalOpen, setMiniCalOpen] = useState(false);
  const [icsSource, setIcsSource] = useState<"airtable" | "supabase">(() => {
    return (localStorage.getItem("ics-data-source") as "airtable" | "supabase") || "airtable";
  });

  const toggleIcsSource = () => {
    const next = icsSource === "airtable" ? "supabase" : "airtable";
    setIcsSource(next);
    localStorage.setItem("ics-data-source", next);
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const {
    swimSessions,
    enrollments,
    poolEvents,
    attendance,
    agreements,
    icsSessions,
    lessonDates,
    loading,
    refetch,
  } = useCalendarData(currentDate, view);

  const navigateDate = (dir: number) => {
    setCurrentDate((d) => addDays(d, view === "week" ? dir * 7 : dir));
  };

  const toggleFilter = (type: ActivityType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Pool Calendar</h2>
          <p className="hidden sm:block text-sm text-muted-foreground">
            Manage lessons and pool schedule
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap max-w-full">
          <Badge variant={icsSource === "supabase" ? "default" : "secondary"} className="hidden sm:inline-flex text-[10px]">
            ICS: {icsSource === "supabase" ? "New DB" : "Airtable"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleIcsSource}
            className="hidden sm:inline-flex text-xs gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Switch to {icsSource === "airtable" ? "New DB" : "Airtable"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button size="sm" onClick={() => { setPrefillStartTime(null); setShowAddEvent(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      {/* Legend (desktop) */}
      <div className="hidden sm:flex flex-wrap gap-3 text-xs">
        {[
          { label: "I Can Swim", border: "#2a5e84", bg: "#d4f0f8" },
          { label: "Swim Sessions", border: "#1a3a8a", bg: "#d0ddf7" },
          { label: "Private Lesson", border: "#26215C", bg: "#EEEDFE" },
          { label: "Semi-Private", border: "#4B1528", bg: "#FBEAF0" },
          { label: "Dive Session", border: "#633806", bg: "#FAEEDA" },
          { label: "Pool Rental", border: "#2C2C2A", bg: "#F1EFE8" },
          { label: "Maintenance", border: "#666", bg: "#F3F3F3" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full border-2"
              style={{ backgroundColor: item.bg, borderColor: item.border }}
            />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <CalendarFilterBar
        activeFilters={activeFilters}
        onToggle={toggleFilter}
        onShowAll={() => setActiveFilters(new Set(ALL_FILTERS))}
      />

      {/* Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 sm:flex sm:gap-2 min-w-0 w-full sm:w-auto">
          <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={miniCalOpen} onOpenChange={setMiniCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full min-w-0 justify-start px-2 sm:min-w-[180px] sm:w-auto sm:px-3">
                <CalIcon className="w-4 h-4 mr-1.5 shrink-0 sm:mr-2" />
                <span className="min-w-0 truncate">
                  {view === "day"
                    ? format(currentDate, "EEE, MMM d, yyyy")
                    : `${format(weekDates[0], "MMM d")} – ${format(weekDates[6], "MMM d, yyyy")}`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex gap-1 p-2 border-b">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setCurrentDate(new Date()); setMiniCalOpen(false); }}>Today</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setCurrentDate(addDays(currentDate, -30)); }}>← Month</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setCurrentDate(addDays(currentDate, 30)); }}>Month →</Button>
              </div>
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(d) => {
                  if (d) {
                    setCurrentDate(d);
                    setMiniCalOpen(false);
                  }
                }}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" onClick={() => navigateDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-2 sm:flex sm:w-auto">
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Week day tabs (quick day selector) */}
      {view === "day" && (
        <div className="grid grid-cols-7 gap-1 min-w-0">
          {weekDates.map((d) => (
            <button
              key={d.toISOString()}
              onClick={() => setCurrentDate(d)}
              className={cn(
                "flex min-w-0 flex-col items-center px-1 py-1.5 rounded-lg text-xs transition-colors",
                format(d, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd")
                  ? "bg-primary text-primary-foreground"
                  : isToday(d)
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <span className="font-medium">{format(d, "EEE")}</span>
              <span className="font-bold text-sm">{format(d, "d")}</span>
            </button>
          ))}
        </div>
      )}

      {/* Calendar Body */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : view === "day" ? (
        <CalendarDayView
          date={currentDate}
          swimSessions={swimSessions}
          enrollments={enrollments}
          poolEvents={poolEvents}
          attendance={attendance}
          agreements={agreements}
          icsSessions={icsSessions}
          lessonDates={lessonDates}
          activeFilters={activeFilters}
          onAttendanceChange={refetch}
          onEditEvent={(event) => {
            setEditingEvent(event);
            setShowAddEvent(true);
          }}
          onDeleteEvent={() => refetch()}
          onAddEvent={(prefill) => {
            setPrefillStartTime(prefill.startTime);
            setShowAddEvent(true);
          }}
        />
      ) : (
        <CalendarWeekView
          weekDates={weekDates}
          currentDate={currentDate}
          swimSessions={swimSessions}
          enrollments={enrollments}
          poolEvents={poolEvents}
          onSelectDate={(d) => {
            setCurrentDate(d);
            setView("day");
          }}
        />
      )}


      <AddPoolEventDialog
        open={showAddEvent}
        onOpenChange={(open) => {
          setShowAddEvent(open);
          if (!open) {
            setEditingEvent(null);
            setPrefillStartTime(null);
          }
        }}
        defaultDate={currentDate}
        onSaved={refetch}
        editEvent={editingEvent}
        prefillStartTime={prefillStartTime}
      />
    </div>
  );
};

export default CalendarAdmin;
