import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SwimmerModalProvider } from "@/components/admin/swimmer/SwimmerModalProvider";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import InboundSmsNotifier from "@/components/admin/InboundSmsNotifier";

const AdminLayout = () => {
  return (
    <SidebarProvider>
      <SwimmerModalProvider>
        <InboundSmsNotifier />
        <div className="min-h-screen flex w-full overflow-x-hidden flex-col">
          <PaymentTestModeBanner />
          <div className="flex flex-1 w-full overflow-x-hidden">
          <AdminSidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="h-14 flex items-center border-b px-4 bg-card">
              <SidebarTrigger className="mr-4" />
              <h1 className="font-display text-lg font-semibold text-foreground">
                Admin Dashboard
              </h1>
            </header>
            <main className="flex-1 min-w-0 p-3 sm:p-6 bg-background overflow-y-auto overflow-x-hidden">
              <Outlet />
            </main>
          </div>
          </div>
        </div>
      </SwimmerModalProvider>
    </SidebarProvider>
  );
};

export default AdminLayout;
