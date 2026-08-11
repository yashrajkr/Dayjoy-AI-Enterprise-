"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

const DEMO_EMAIL = "admin@dayjoy.ai";
const DEMO_PASSWORD = "Dayjoy@2026";

const highlights = [
  { icon: Zap, title: "Voice AI", desc: "Sarah answers in <2s" },
  { icon: Phone, title: "WhatsApp", desc: "Cloud API native" },
  { icon: ShieldCheck, title: "DPDP Ready", desc: "Audit + PII redaction" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);

    // Simulated auth call — replace with real POST /api/auth/login when backend is wired
    await new Promise((r) => setTimeout(r, 900));

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    // Persist a mock session — the real app would store the JWT
    try {
      window.localStorage.setItem(
        "dayjoy_auth",
        JSON.stringify({
          email,
          role: "SUPER_ADMIN",
          name: "Admin User",
          ts: Date.now(),
        }),
      );
    } catch {
      // ignore storage errors
    }

    toast.success("Welcome back", {
      description: "Signed in as Admin User · SUPER_ADMIN",
    });

    setLoading(false);
    router.push("/");
  };

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    toast.info("Demo credentials filled", {
      description: "Click Sign In to enter the dashboard.",
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="orb top-[-10%] left-[-5%] size-[420px] bg-brand/12" />
        <span className="orb top-[35%] right-[-10%] size-[380px] bg-info/8 [animation-duration:28s]" />
        <span className="orb bottom-[-15%] left-[30%] size-[420px] bg-violet/8 [animation-duration:34s]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-6 py-10 lg:flex-row lg:gap-16">
        {/* Left — brand / value prop */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden flex-1 lg:block"
        >
          <div className="flex items-center gap-3">
            <div className="bg-gradient-brand grid size-12 shrink-0 place-items-center rounded-2xl shadow-[0_18px_50px_-20px_var(--brand)]">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">Dayjoy AI</p>
              <p className="text-[13px] text-subtle">Enterprise Platform</p>
            </div>
          </div>

          <h1 className="mt-10 text-4xl font-bold leading-tight tracking-tight">
            The enterprise AI
            <br />
            control plane for{" "}
            <span className="text-brand">Dayjoy</span>.
          </h1>

          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-subtle">
            One console for Voice AI, WhatsApp, RAG knowledge, CRM, and analytics.
            Built for Indian distributors, customers, and employees — with DPDP-grade
            compliance baked in.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {highlights.map((h, i) => {
              const Icon = h.icon;
              return (
                <motion.div
                  key={h.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                  className="glass rounded-2xl p-4"
                >
                  <div className="bg-gradient-brand mb-3 grid size-9 place-items-center rounded-xl">
                    <Icon className="size-4 text-primary-foreground" />
                  </div>
                  <p className="text-[13px] font-semibold">{h.title}</p>
                  <p className="mt-0.5 text-[11px] text-subtle">{h.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Right — login card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          {/* Mobile brand header */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="bg-gradient-brand grid size-11 shrink-0 place-items-center rounded-2xl shadow-[0_18px_50px_-20px_var(--brand)]">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Dayjoy AI</p>
              <p className="text-[12px] text-subtle">Enterprise Platform</p>
            </div>
          </div>

          <div className="glass tilt-card rounded-3xl p-7 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
              <p className="mt-1 text-[13px] text-subtle">
                Use your Dayjoy enterprise account to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[12px] font-semibold text-foreground"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@dayjoy.ai"
                    className="h-11 w-full rounded-xl border border-border bg-glass pl-10 pr-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/40 focus:ring-2 focus:ring-ring/40"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-[12px] font-semibold text-foreground"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      toast.info("Password reset", {
                        description:
                          "A reset link would be emailed to your address.",
                      })
                    }
                    className="text-[12px] font-medium text-brand hover:opacity-80"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-border bg-glass pl-10 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/40 focus:ring-2 focus:ring-ring/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember + SSO */}
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-subtle">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={remember}
                    onClick={() => setRemember((r) => !r)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      remember ? "bg-gradient-success" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${
                        remember ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </button>
                  Keep me signed in
                </label>
                <button
                  type="button"
                  onClick={() =>
                    toast.info("SSO", {
                      description: "SAML / Google Workspace SSO coming soon.",
                    })
                  }
                  className="text-[12px] font-medium text-subtle hover:text-foreground"
                >
                  Use SSO →
                </button>
              </div>

              {/* Error */}
              {error ? (
                <div className="rounded-xl border border-danger/25 bg-danger/8 px-3 py-2.5 text-[12px] text-danger">
                  {error}
                </div>
              ) : null}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="bg-gradient-brand flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-primary-foreground transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>

              {/* Demo fill */}
              <button
                type="button"
                onClick={fillDemo}
                className="w-full rounded-xl border border-border bg-glass px-3 py-2.5 text-[12px] font-medium text-subtle transition-colors hover:border-brand/30 hover:text-foreground"
              >
                Fill demo credentials
              </button>
            </form>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>DEMO BUILD</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Demo creds box */}
            <div className="rounded-xl border border-border bg-glass px-4 py-3 text-[12px]">
              <p className="font-semibold text-foreground">Demo credentials</p>
              <p className="mt-1 text-subtle">
                Email: <span className="num font-mono">{DEMO_EMAIL}</span>
              </p>
              <p className="text-subtle">
                Password: <span className="num font-mono">{DEMO_PASSWORD}</span>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            By signing in you agree to the Dayjoy AI Terms of Service and Privacy Policy.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
