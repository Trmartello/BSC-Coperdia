import { Sidebar } from '../../components/ui/Sidebar';
import { Topbar } from '../../components/ui/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117]">
      <Sidebar />
      <div className="pl-[200px] flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 px-6 py-3">{children}</main>
      </div>
    </div>
  );
}
