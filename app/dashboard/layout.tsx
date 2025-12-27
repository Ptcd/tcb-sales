import { getUser } from "@/app/actions/auth";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { NavigationLoader } from "@/components/NavigationLoader";
import { CallProvider } from "@/components/CallProvider";
import { IncomingCallPopup } from "@/components/IncomingCallPopup";
import { CallStatusIndicator } from "@/components/CallStatusIndicator";
import { ActiveCallPanel } from "@/components/ActiveCallPanel";

export const metadata = {
  title: "Dashboard - Google Maps Data Dashboard",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ErrorBoundary>
      <CallProvider>
        <NavigationLoader>
          <div className="min-h-screen">
            <Header userEmail={user.email} />
            <main className="max-w-[98%] 2xl:max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
              {children}
            </main>
            <IncomingCallPopup />
            <CallStatusIndicator />
            <ActiveCallPanel />
          </div>
        </NavigationLoader>
      </CallProvider>
    </ErrorBoundary>
  );
}
