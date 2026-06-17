import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const INSTRUCTOR_ALLOWED_PATHS = ["/admin/messages"];

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, isInstructor, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;

  const instructorAllowed =
    isInstructor &&
    INSTRUCTOR_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!isAdmin && !instructorAllowed) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;

