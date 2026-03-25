import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, RefreshCw, Sun, Moon, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";

const OTP_LENGTH = 6;
type Step = "email" | "otp" | "password" | "success";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [step, setStep]             = useState<Step>("email");
  const [email, setEmail]           = useState("");
  const [digits, setDigits]         = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [newPassword, setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [cooldownSecs, setCooldownSecs] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(OTP_LENGTH).fill(null));

  useEffect(() => {
    if (step === "otp") inputRefs.current[0]?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const t = setTimeout(() => setCooldownSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSecs]);

  // Auto-submit OTP when all digits are filled
  useEffect(() => {
    if (step === "otp" && digits.every(d => d !== "") && !loading) {
      handleVerifyOtp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  // ── Step 1: send OTP ────────────────────────────────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    try {
      // Use the password-recovery flow so verifyOtp gets a recovery session
      // that can call updateUser({ password }).
      await supabase.auth.resetPasswordForEmail(trimmed);
      // Always move to OTP step — don't reveal whether the email exists.
      setEmail(trimmed);
      setStep("otp");
      setCooldownSecs(60);
    } catch {
      setStep("otp");
      setCooldownSecs(60);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: OTP input helpers ───────────────────────────────────────────────
  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError("");
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits]; next[index] = ""; setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits]; next[index - 1] = ""; setDigits(next);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    setError("");
    inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  // ── Step 2: verify OTP ──────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const otp = digits.join("");
    if (otp.length < OTP_LENGTH) { setError("Please enter all 6 digits."); return; }

    setLoading(true);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "recovery",
      });
      if (verifyError) {
        setError("Wrong or expired code. Please try again.");
        setDigits(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } else if (!data.session) {
        setError("Verification failed — no session returned. Please request a new code.");
        setDigits(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } else {
        // Check if this is a Google-only account (no email identity = no password)
        const hasEmailIdentity = data.user?.identities?.some(id => id.provider === "email");
        if (!hasEmailIdentity) {
          await supabase.auth.signOut();
          setStep("email");
          setDigits(Array(OTP_LENGTH).fill(""));
          setError("This account uses Google sign-in. Please go back and sign in with Google.");
          return;
        }
        setStep("password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldownSecs > 0) return;
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email);
      setDigits(Array(OTP_LENGTH).fill(""));
      setError("");
      inputRefs.current[0]?.focus();
      toast({ title: "New code sent to your email." });
      setCooldownSecs(60);
    } catch {
      toast({ title: "Could not resend code. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: set new password ────────────────────────────────────────────────
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Session expired. Please go back and verify your code again.");
        return;
      }

      // Call updateUser directly via fetch using the session token so we
      // bypass the Supabase JS client's internal lock/retry logic that can
      // cause the call to hang for 10-30 seconds.
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("updateUser error:", res.status, body);
        const msg: string = body?.msg ?? body?.message ?? "";
        if (msg.toLowerCase().includes("same") || msg.toLowerCase().includes("different")) {
          setError("New password must be different from your current password.");
        } else if (msg.toLowerCase().includes("weak") || msg.toLowerCase().includes("strength")) {
          setError("Password is too weak. Try adding numbers or symbols.");
        } else if (res.status === 422) {
          setError(msg || "Invalid request. Make sure your password is at least 8 characters.");
        } else {
          setError(msg || "Could not update password. Please try again.");
        }
        return;
      }

      // Sign out so the recovery session doesn't linger in localStorage.
      // Without this, navigating to "/" would redirect to /setup because
      // AuthRoute sees an active session.
      await supabase.auth.signOut();
      setStep("success");
    } catch (err: any) {
      setError(err?.message || "Could not update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const stepConfig = {
    email:    { title: "Forgot password?",      subtitle: "Enter your email and we'll send you a verification code." },
    otp:      { title: "Enter verification code", subtitle: `We sent a 6-digit code to ${email}` },
    password: { title: "Set new password",       subtitle: "Choose a strong password for your account." },
    success:  { title: "Password updated!",      subtitle: "Your password has been changed successfully." },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-10 relative">
      <button onClick={toggleTheme}
        className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-4 ${step === "success" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
              {step === "success"
                ? <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                : <KeyRound className="h-8 w-8 text-primary" />}
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">{stepConfig[step].title}</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{stepConfig[step].subtitle}</p>
          </div>

          {/* ── Step 1: Email ── */}
          {step === "email" && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? "Sending…" : "Send verification code"}
              </Button>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === "otp" && (
            <>
              <div className="flex gap-2.5 justify-center mb-2" onPaste={handlePaste}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className={[
                      "w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-background",
                      "transition-colors outline-none caret-transparent",
                      error ? "border-destructive text-destructive"
                            : digit ? "border-primary text-foreground"
                                    : "border-border text-foreground",
                      "focus:border-primary",
                    ].join(" ")}
                  />
                ))}
              </div>

              <div className="h-6 flex items-center justify-center mb-4">
                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive">{error}</motion.p>
                )}
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || digits.join("").length < OTP_LENGTH}
                className="w-full h-11 mb-3"
              >
                {loading ? "Verifying…" : "Verify code"}
              </Button>

              <Button
                variant="outline"
                onClick={handleResendOtp}
                disabled={loading || cooldownSecs > 0}
                className="w-full h-11 gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {cooldownSecs > 0 ? `Resend in ${cooldownSecs}s` : "Resend code"}
              </Button>
            </>
          )}

          {/* ── Step 3: New password ── */}
          {step === "password" && (
            <form onSubmit={handleSetPassword} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">New password</label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError(""); }}
                    placeholder="Min. 8 characters"
                    className="h-11 pr-10"
                    required
                    disabled={loading}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Confirm password</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
                    placeholder="Re-enter password"
                    className="h-11 pr-10"
                    required
                    disabled={loading}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full h-11 mt-1">
                {loading ? "Updating…" : "Set new password"}
              </Button>
            </form>
          )}

          {/* ── Step 4: Success ── */}
          {step === "success" && (
            <Button onClick={() => navigate("/", { replace: true })} className="w-full h-11">
              Go to sign in
            </Button>
          )}

          {/* Back link */}
          {step !== "success" && (
            <button
              onClick={() => step === "email" ? navigate("/") : setStep(step === "otp" ? "email" : "otp")}
              className="mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {step === "email" ? "Back to sign in" : "Back"}
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
