import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { Home, Search, MessageCircle, Users, Bell, Leaf, Sun, Moon } from "lucide-react";

const navItems = [
  { to: "/feed",          icon: Home,          label: "Feed"          },
  { to: "/discover",      icon: Search,        label: "Discover"      },
  { to: "/messages",      icon: MessageCircle, label: "Messages"      },
  { to: "/groups",        icon: Users,         label: "Groups"        },
  { to: "/notifications", icon: Bell,          label: "Notifications" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useUser();

  return (
    <div className="min-h-screen flex bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card fixed h-screen z-30">
        <Link to="/feed" className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Leaf className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">Prolifier</span>
        </Link>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <Link
            to="/profile"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              pathname === "/profile"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 text-white ${
              pathname === "/profile" ? "opacity-90" : ""
            } ${user.color}`}>
              {user.avatar}
            </div>
            My Profile
          </Link>

          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-150"
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4 shrink-0" />
              : <Moon className="h-4 w-4 shrink-0" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-64 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border px-4 flex items-center justify-between"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
        >
          <Link to="/feed" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Leaf className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">Prolifier</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/profile">
              <div className={`h-8 w-8 rounded-full ${user.color} flex items-center justify-center text-white text-xs font-semibold`}>
                {user.avatar}
              </div>
            </Link>
          </div>
        </header>

        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur-md border-t border-border flex justify-around"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))", paddingTop: "0.5rem" }}
      >
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors min-w-0 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform duration-150 ${active ? "scale-110" : ""}`} />
              <span className={`${active ? "font-medium" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
