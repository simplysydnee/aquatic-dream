import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import SwimLessons from "./pages/SwimLessons";
import Scuba from "./pages/Scuba";
import DiveTrips from "./pages/DiveTrips";
import Safety from "./pages/Safety";
import Equipment from "./pages/Equipment";
import DreamDivers from "./pages/DreamDivers";
import Community from "./pages/Community";
import SwimEnrollment from "./pages/SwimEnrollment";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import ProtectedRoute from "./components/admin/ProtectedRoute";
import SwimEnrollmentsAdmin from "./pages/admin/SwimEnrollmentsAdmin";
import DiveBookingsAdmin from "./pages/admin/DiveBookingsAdmin";
import TripReservationsAdmin from "./pages/admin/TripReservationsAdmin";
import ContactsAdmin from "./pages/admin/ContactsAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";
import CalendarAdmin from "./pages/admin/CalendarAdmin";
import NotFound from "./pages/NotFound";
import PublicLayout from "./components/PublicLayout";
import KioskCheckIn from "./pages/KioskCheckIn";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/checkin" element={<KioskCheckIn />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<CalendarAdmin />} />
              <Route path="enrollments" element={<SwimEnrollmentsAdmin />} />
              <Route path="dive-bookings" element={<DiveBookingsAdmin />} />
              <Route path="trip-reservations" element={<TripReservationsAdmin />} />
              <Route path="contacts" element={<ContactsAdmin />} />
              <Route path="users" element={<UsersAdmin />} />
            </Route>

            {/* Public routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/swim-lessons" element={<SwimLessons />} />
              <Route path="/swim-enrollment" element={<SwimEnrollment />} />
              <Route path="/scuba" element={<Scuba />} />
              <Route path="/dive-trips" element={<DiveTrips />} />
              <Route path="/safety" element={<Safety />} />
              <Route path="/equipment" element={<Equipment />} />
              <Route path="/dream-divers" element={<DreamDivers />} />
              <Route path="/community" element={<Community />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
