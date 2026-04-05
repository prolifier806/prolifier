import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leaf, Eye, EyeOff, Sun, Moon, X, ArrowLeft, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { TERMS_AND_PRIVACY } from "@/pages/Profile";
import onboarding1 from "@/assets/onboarding-1.png";
import onboarding2 from "@/assets/onboarding-2.png";
import onboarding3 from "@/assets/onboarding-3.png";

const slides = [
  { title: "Find your people", description: "Connect with founders, builders, and creators who are actively making things happen.", image: onboarding1 },
  { title: "Discover the right match", description: "Browse by skills, goals, and availability to find the perfect collaborator for your project.", image: onboarding2 },
  { title: "Build in public", description: "Share your journey, get feedback, and grow with a supportive community of makers.", image: onboarding3 },
];

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

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
  const [password, setPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading, setLoading]           = useState(false);

  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSecs, setLockoutSecs]       = useState(0);
  const [termsAccepted, setTermsAccepted]   = useState(false);
  const [showTerms, setShowTerms]           = useState(false);

  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (lockoutSecs <= 0) return;
    const t = setTimeout(() => setLockoutSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockoutSecs]);

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
    if (!trimmedEmail || password.length < 8) {
      toast({ title: "Please enter a valid email and password (min 8 characters)", variant: "destructive" });
      return;
    }
    if (authMode === "signup" && password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
        if (error) throw error;

        const emailTaken = !data.user || data.user.identities?.length === 0;
        if (emailTaken) {
          toast({ title: "An account already exists with this email.", description: "Please sign in instead.", variant: "destructive" });
          setAuthMode("login");
          setLoading(false);
          return;
        }

        if (data.session) {
          navigate("/"); // AuthRoute redirects to /setup once session is set
        } else {
          navigate("/verify-email", { state: { email: trimmedEmail } });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
        if (error) throw error;

        setFailedAttempts(0);
        toast({ title: "Welcome back!" });
        navigate("/");
      }
    } catch (err: any) {
      const msg = normalizeAuthError(err.message ?? "");
      if (authMode === "login") {
        const next = failedAttempts + 1;
        if (next >= MAX_ATTEMPTS) {
          setLockoutSecs(LOCKOUT_SECONDS);
          setFailedAttempts(0);
          toast({ title: `Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`, variant: "destructive" });
        } else {
          setFailedAttempts(next);
          toast({
            title: msg,
            description: next === MAX_ATTEMPTS - 1 ? "1 attempt remaining before lockout." : undefined,
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

  const isFormDisabled = loading || lockoutSecs > 0;

  if (showAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-10 relative">
        {/* Terms & Privacy modal */}
        {showTerms && (
          <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowTerms(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="text-base font-semibold text-foreground">Terms & Privacy Policy</h2>
              </div>
              <button onClick={() => setShowTerms(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                {TERMS_AND_PRIVACY}
              </pre>
            </div>
            <div className="px-5 py-4 border-t border-border bg-card">
              <Button className="w-full h-11" onClick={() => { setTermsAccepted(true); setShowTerms(false); }}>
                I agree
              </Button>
            </div>
          </div>
        )}
        <button onClick={toggleTheme}
          className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
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

            {authMode === "signup" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Confirm password</label>
                <div className="relative">
                  <Input type={showConfirm ? "text" : "password"} value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password" className="h-11 pr-10" required disabled={isFormDisabled} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            {authMode === "signup" && (
              <div className="flex items-start gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTermsAccepted(v => !v)}
                  className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                    termsAccepted ? "bg-primary border-primary" : "border-border bg-background"
                  }`}>
                  {termsAccepted && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  I agree to the{" "}
                  <button type="button" onClick={() => setShowTerms(true)}
                    className="text-primary hover:underline font-medium">
                    Terms & Privacy Policy
                  </button>
                </p>
              </div>
            )}

            {lockoutSecs > 0 && (
              <p className="text-xs text-destructive text-center">Too many failed attempts. Try again in {lockoutSecs}s.</p>
            )}

            <Button type="submit" disabled={isFormDisabled || (authMode === "signup" && !termsAccepted)} className="w-full h-11 font-semibold mt-1">
              {loading ? "Please wait…"
                : lockoutSecs > 0 ? `Locked for ${lockoutSecs}s`
                : authMode === "signup" ? "Create account"
                : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-5">
            {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => { setAuthMode(m => m === "signup" ? "login" : "signup"); setFailedAttempts(0); setLockoutSecs(0); setConfirmPassword(""); setTermsAccepted(false); }}
              className="text-primary font-medium hover:underline">
              {authMode === "signup" ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
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
        <div className="flex flex-col items-center text-center animate-in fade-in duration-300">
            <img src={slides[current].image} alt={slides[current].title}
              className="w-72 h-52 object-contain mb-8 rounded-xl" />
            <h1 className="font-display text-3xl font-bold mb-3 text-foreground">{slides[current].title}</h1>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-xs">{slides[current].description}</p>
          </div>

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
