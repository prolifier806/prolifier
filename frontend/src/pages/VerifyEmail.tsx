import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, RefreshCw, Sun, Moon, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";

const OTP_LENGTH = 6;

export default function VerifyEmail() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const email: string = state?.email ?? "";

  const [digits, setDigits]       = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState("");
  const [resending, setResending] = useState(false);
  const [cooldownSecs, setCooldownSecs] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(OTP_LENGTH).fill(null));

  // Focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-submit when all digits are filled
  useEffect(() => {
    if (digits.every(d => d !== "") && !verifying) {
      handleVerify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  // Resend countdown
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const t = setTimeout(() => setCooldownSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownSecs]);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError("");
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
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

  const handleVerify = async () => {
    const otp = digits.join("");
    if (otp.length < OTP_LENGTH) {
      setError("Please enter all 6 digits.");
      return;
    }
    if (!email) {
      toast({ title: "Session lost. Please sign up again.", variant: "destructive" });
      navigate("/");
      return;
    }

    setVerifying(true);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "signup",
      });

      if (verifyError) {
        setError("Wrong or expired code. Please try again.");
        // Shake the inputs by clearing them so the user re-enters
        setDigits(Array(OTP_LENGTH).fill(""));
        inputRefs.current[0]?.focus();
      } else if (data.session) {
        navigate("/", { replace: true }); // AuthRoute redirects to /setup once session is set
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldownSecs > 0 || resending) return;
    if (!email) {
      toast({ title: "Session lost. Please sign up again.", variant: "destructive" });
      navigate("/");
      return;
    }
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (resendError) throw resendError;
      setDigits(Array(OTP_LENGTH).fill(""));
      setError("");
      inputRefs.current[0]?.focus();
      toast({ title: "New code sent to your email." });
      setCooldownSecs(60);
    } catch (err: any) {
      console.error("[Resend OTP]", err);
      toast({ title: err?.message ?? "Could not resend code. Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const filled = digits.join("").length === OTP_LENGTH;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-10 relative">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-sm text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Enter verification code</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            We sent a 6-digit code to
            {email ? (
              <>
                <br />
                <span className="font-medium text-foreground">{email}</span>
              </>
            ) : " your email"}
          </p>
        </div>

        {/* OTP inputs */}
        <div className="flex gap-2.5 justify-center mb-2" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={[
                "w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-background",
                "transition-colors outline-none caret-transparent",
                error
                  ? "border-destructive text-destructive"
                  : digit
                  ? "border-primary text-foreground"
                  : "border-border text-foreground",
                "focus:border-primary",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-6 flex items-center justify-center mb-4">
          {error && (
            <p className="text-sm text-destructive animate-in fade-in duration-150">
              {error}
            </p>
          )}
        </div>

        {/* Verify button */}
        <Button
          onClick={handleVerify}
          disabled={verifying || !filled}
          className="w-full h-11 mb-3"
        >
          {verifying ? "Verifying..." : "Verify email"}
        </Button>

        {/* Resend button */}
        <Button
          variant="outline"
          onClick={handleResend}
          disabled={resending || cooldownSecs > 0}
          className="w-full h-11 gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
          {cooldownSecs > 0 ? `Resend in ${cooldownSecs}s` : "Resend code"}
        </Button>

        {/* Back to sign up */}
        <button
          onClick={() => navigate("/")}
          className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors w-full flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign up
        </button>
      </div>
    </div>
  );
}
