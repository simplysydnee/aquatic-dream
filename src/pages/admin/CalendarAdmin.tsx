import { useState } from "react";
import { format, addDays, startOfWeek, isToday, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import CalendarDayView from "@/components/admin/calendar/CalendarDayView";
import CalendarWeekView from "@/components/admin/calendar/CalendarWeekView";
import AddPoolEventDialog from "@/components/admin/calendar/AddPoolEventDialog";
import { useCalendarData } from "@/hooks/useCalendarData";

const CalendarAdmin = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"day" | "week">("day");
  const [showAddEvent, setShowAddEvent] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const {
    swimSessions,
    enrollments,
    poolEvents,
    attendance,
    loading,
    refetch,
  } = useCalendarData(currentDate, view);

  const navigateDate = (dir: number) => {
    setCurrentDate((d) => addDays(d, view === "week" ? dir * 7 : dir));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Pool Calendar</h2>
          <p className="text-sm text-muted-foreground">
            Manage lessons, dive sessions, and pool rentals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button size="sm" onClick={() => setShowAddEvent(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[180px]">
                <CalIcon className="w-4 h-4 mr-2" />
                {view === "day"
                  ? format(currentDate, "EEEE, MMMM d, yyyy")
                  : `${format(weekDates[0], "MMM d")} – ${format(weekDates[6], "MMM d, yyyy")}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(d) => d && setCurrentDate(d)}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" onClick={() => navigateDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: "Swim Lessons", color: "bg-blue-400" },
          { label: "I Can Swim", color: "bg-amber-400" },
          { label: "Dive Session", color: "bg-emerald-500" },
          { label: "Pool Rental", color: "bg-purple-400" },
          { label: "Maintenance", color: "bg-gray-400" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-2.5 h-2.5 rounded border border-dashed border-muted-foreground" />
          <span className="text-muted-foreground">Shallow end</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded border-2 border-muted-foreground" />
          <span className="text-muted-foreground">Deep end</span>
        </div>
      </div>

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
          onAttendanceChange={refetch}
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
        onOpenChange={setShowAddEvent}
        defaultDate={currentDate}
        onSaved={refetch}
      />
    </div>
  );
};

export default CalendarAdmin;
