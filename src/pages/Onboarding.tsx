import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leaf, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import onboarding1 from "@/assets/onboarding-1.png";
import onboarding2 from "@/assets/onboarding-2.png";
import onboarding3 from "@/assets/onboarding-3.png";

const slides = [
  { title: "Find your people", description: "Connect with founders, builders, and creators who are actively making things happen.", image: onboarding1 },
  { title: "Discover the right match", description: "Browse by skills, goals, and availability to find the perfect collaborator for your project.", image: onboarding2 },
  { title: "Build in public", description: "Share your journey, get feedback, and grow with a supportive community of makers.", image: onboarding3 },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// Max failed attempts before temporary lockout
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

// Normalize Supabase auth errors to generic messages so we don't leak
// whether an email address exists in the system (prevents enumeration).
function normalizeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid credentials") || m.includes("user not found")) {
    return "Incorrect email or password.";
  }
  if (m.includes("already registered") || m.includes("user already exists")) {
    return "An account already exists with this email. Please sign in.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment before trying again.";
  }
  return "Something went wrong. Please try again.";
}

type AuthMode = "signup" | "login";

export default function Onboarding() {
  const [current, setCurrent]   = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  // Brute-force protection: lock form after MAX_ATTEMPTS consecutive failures
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSecs, setLockoutSecs] = useState(0);

  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Count down the lockout timer each second
  useEffect(() => {
    if (lockoutSecs <= 0) return;
    const t = setTimeout(() => setLockoutSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockoutSecs]);

  // Show message if the user's account was permanently deleted after the 7-day window
  useEffect(() => {
    if (localStorage.getItem("prolifier_perm_deleted") === "true") {
      localStorage.removeItem("prolifier_perm_deleted");
      toast({
        title: "Account permanently deleted",
        description: "Your account no longer exists. You can sign up with the same email to create a new one.",
        variant: "destructive",
      });
      setShowAuth(true);
      setAuthMode("signup");
    }
  }, []);

  const next = () => {
    if (current < slides.length - 1) setCurrent(current + 1);
    else setShowAuth(true);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lockoutSecs > 0) return;

    const trimmedEmail = email.trim().toLowerCase();

    // Password minimum raised to 8 — 6 chars is too weak for user accounts
    if (!trimmedEmail || password.length < 8) {
      toast({ title: "Please enter a valid email and password (min 8 characters)", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        // Supabase returns identities: [] (or user: null) when email is already registered.
        // Try signing in automatically with the same credentials instead of showing an error.
        const emailTaken = !data.user || data.user.identities?.length === 0;
        if (emailTaken) {
          const { error: loginErr } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
          if (loginErr) {
            toast({ title: "An account already exists with this email.", description: "Please sign in with the correct password, or use Google if you signed up that way.", variant: "destructive" });
            setAuthMode("login");
          } else {
            toast({ title: "Welcome back!" });
            navigate("/");
          }
          setLoading(false);
          return;
        }

        if (data.session) {
          navigate("/setup");
        } else {
          navigate("/verify-email", { state: { email: trimmedEmail } });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;

        // Reset failure counter on success
        setFailedAttempts(0);
        toast({ title: "Welcome back!" });
        // Navigate to "/" — AuthRoute reads profileComplete and sends to /feed or /setup
        navigate("/");
      }
    } catch (err: any) {
      const msg = normalizeAuthError(err.message ?? "");

      // Increment failure counter for login attempts only
      if (authMode === "login") {
        const next = failedAttempts + 1;
        if (next >= MAX_ATTEMPTS) {
          setLockoutSecs(LOCKOUT_SECONDS);
          setFailedAttempts(0);
          toast({
            title: `Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`,
            variant: "destructive",
          });
        } else {
          setFailedAttempts(next);
          const remaining = MAX_ATTEMPTS - next;
          const isWrongCreds = msg === "Incorrect email or password.";
          toast({
            title: msg,
            description: remaining === 1
              ? "1 attempt remaining before lockout."
              : isWrongCreds
              ? "If you signed up with Google, use the Google sign-in button above."
              : undefined,
            variant: "destructive",
          });
        }
      } else {
        toast({ title: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // Redirect to "/" so AuthRoute checks profileComplete and sends the user
        // to /setup (new) or /feed (returning) — never hardcode /feed here.
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err: any) {
      toast({ title: "Google sign in failed. Please try again.", variant: "destructive" });
      setLoading(false);
    }
  };

  const isFormDisabled = loading || lockoutSecs > 0;

  if (showAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-10 relative">
        <button onClick={toggleTheme}
          className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
              <Leaf className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {authMode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {authMode === "signup" ? "Join a global community of makers" : "Sign in to continue building"}
            </p>
          </div>

          <button onClick={handleGoogle} disabled={isFormDisabled}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50 mb-4">
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className="h-11" required disabled={isFormDisabled} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">Password</label>
                {authMode === "login" && (
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Input type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min. 8 characters" className="h-11 pr-10" required disabled={isFormDisabled} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {lockoutSecs > 0 && (
              <p className="text-xs text-destructive text-center">
                Too many failed attempts. Try again in {lockoutSecs}s.
              </p>
            )}

            <Button type="submit" disabled={isFormDisabled} className="w-full h-11 font-semibold mt-1">
              {loading ? "Please wait…"
                : lockoutSecs > 0 ? `Locked for ${lockoutSecs}s`
                : authMode === "signup" ? "Create account"
                : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => { setAuthMode(m => m === "signup" ? "login" : "signup"); setFailedAttempts(0); setLockoutSecs(0); }}
              className="text-primary font-medium hover:underline">
              {authMode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 relative">
      <button onClick={toggleTheme}
        className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div key={current} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35 }}
            className="flex flex-col items-center text-center">
            <img src={slides[current].image} alt={slides[current].title}
              className="w-72 h-52 object-contain mb-8 rounded-xl" />
            <h1 className="font-display text-3xl font-bold mb-3 text-foreground">{slides[current].title}</h1>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-xs">{slides[current].description}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`h-2 rounded-full transition-all duration-300 ${i === current ? "w-8 bg-primary" : "w-2 bg-border"}`} />
          ))}
        </div>

        <Button onClick={next} className="w-full h-12 text-base font-semibold rounded-xl">
          {current === slides.length - 1 ? "Get Started" : "Next"}
        </Button>

        {current < slides.length - 1 && (
          <button onClick={() => setShowAuth(true)}
            className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
