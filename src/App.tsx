import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Index from "./pages/Index";
import SwimLessons from "./pages/SwimLessons";
import Scuba from "./pages/Scuba";
import DiveTrips from "./pages/DiveTrips";
import Safety from "./pages/Safety";
import Equipment from "./pages/Equipment";
import DreamDivers from "./pages/DreamDivers";
import Community from "./pages/Community";
import SwimEnrollment from "./pages/SwimEnrollment";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Navbar />
        <Routes>
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
        </Routes>
        <Footer />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
