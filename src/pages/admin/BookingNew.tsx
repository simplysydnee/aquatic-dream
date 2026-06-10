import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import BookingWizard from "@/components/admin/booking/BookingWizard";

export default function BookingNew() {
  const navigate = useNavigate();
  return (
    <div className="container max-w-5xl py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
        <ChevronLeft className="w-4 h-4 mr-1" /> Back
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Book a lesson</h1>
        <p className="text-sm text-muted-foreground">Create a private, semi-private, or group enrollment.</p>
      </div>
      <BookingWizard
        onCancel={() => navigate(-1)}
        onDone={() => navigate("/admin/private-lessons")}
      />
    </div>
  );
}
