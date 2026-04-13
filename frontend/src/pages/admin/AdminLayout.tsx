import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, FileText, Flag, Bell, Activity, LogOut, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin",          label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users",    label: "Users",     icon: Users },
  { to: "/admin/posts",    label: "Posts",     icon: FileText },
  { to: "/admin/reports",  label: "Reports",   icon: Flag },
  { to: "/admin/notices",  label: "Notices",   icon: Bell },
  { to: "/admin/activity", label: "Activity",  icon: Activity },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useUser();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Admin Panel</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-3 border-t border-border space-y-2">
          <div className="px-3 py-1">
            <p className="text-xs font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
