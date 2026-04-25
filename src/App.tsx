import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Careers from "./pages/Careers";
import SwimLessons from "./pages/SwimLessons";
import SwimEnrollment from "./pages/SwimEnrollment";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import ProtectedRoute from "./components/admin/ProtectedRoute";
import SwimEnrollmentsAdmin from "./pages/admin/SwimEnrollmentsAdmin";
import LessonRequestsAdmin from "./pages/admin/LessonRequestsAdmin";
import ContactsAdmin from "./pages/admin/ContactsAdmin";
import InstructorsAdmin from "./pages/admin/InstructorsAdmin";
import SessionsAdmin from "./pages/admin/SessionsAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";
import CalendarAdmin from "./pages/admin/CalendarAdmin";
import ClassRosterAdmin from "./pages/admin/ClassRosterAdmin";
import JobPostingsAdmin from "./pages/admin/JobPostingsAdmin";
import JobApplicationsAdmin from "./pages/admin/JobApplicationsAdmin";
import ScheduleAdmin from "./pages/admin/ScheduleAdmin";
import TimeOffAdmin from "./pages/admin/TimeOffAdmin";
import TimesheetsAdmin from "./pages/admin/TimesheetsAdmin";
import InstructorLayout from "./pages/instructor/InstructorLayout";
import InstructorMySchedule from "./pages/instructor/InstructorMySchedule";
import InstructorMyRoster from "./pages/instructor/InstructorMyRoster";
import InstructorAvailability from "./pages/instructor/InstructorAvailability";
import InstructorTimeOff from "./pages/instructor/InstructorTimeOff";
import InstructorOpenShifts from "./pages/instructor/InstructorOpenShifts";
import InstructorTimeClock from "./pages/instructor/InstructorTimeClock";
import NotFound from "./pages/NotFound";
import PublicLayout from "./components/PublicLayout";
import KioskCheckIn from "./pages/KioskCheckIn";
import Unsubscribe from "./pages/Unsubscribe";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/checkin" element={<KioskCheckIn />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<CalendarAdmin />} />
              <Route path="roster" element={<ClassRosterAdmin />} />
              <Route path="enrollments" element={<SwimEnrollmentsAdmin />} />
              <Route path="lesson-requests" element={<LessonRequestsAdmin />} />
              <Route path="contacts" element={<ContactsAdmin />} />
              <Route path="instructors" element={<InstructorsAdmin />} />
              <Route path="schedule" element={<ScheduleAdmin />} />
              <Route path="time-off" element={<TimeOffAdmin />} />
              <Route path="timesheets" element={<TimesheetsAdmin />} />
              <Route path="sessions" element={<SessionsAdmin />} />
              <Route path="careers" element={<JobPostingsAdmin />} />
              <Route path="applications" element={<JobApplicationsAdmin />} />
              <Route path="users" element={<UsersAdmin />} />
            </Route>

            {/* Instructor portal */}
            <Route path="/instructor" element={<InstructorLayout />}>
              <Route index element={<InstructorMySchedule />} />
              <Route path="roster" element={<InstructorMyRoster />} />
              <Route path="availability" element={<InstructorAvailability />} />
              <Route path="time-off" element={<InstructorTimeOff />} />
              <Route path="open-shifts" element={<InstructorOpenShifts />} />
              <Route path="time-clock" element={<InstructorTimeClock />} />
            </Route>

            {/* Public routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/swim-lessons" element={<SwimLessons />} />
              <Route path="/swim-enrollment" element={<SwimEnrollment />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
