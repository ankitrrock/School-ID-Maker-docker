import { FormEvent, useState } from "react";

type User = { id: string; name: string; email: string };

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").trim().replace(/\/$/, "");

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

export async function getSession(): Promise<User | null> {
  try {
    const data = await api("/auth/me");
    return data.user as User;
  } catch {
    return null;
  }
}

export async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => undefined);
}

function ResetPassword({ token, onBack }: { token: string; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const data = await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setMessage(data.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reset password.");
    }
  }

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-bold text-slate-900">Reset password</h1><p className="mt-2 text-sm text-slate-500">Choose a new password for your account.</p><form onSubmit={submit} className="mt-6 space-y-4"><input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="New password" />{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}{message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}<button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">Reset password</button></form><button onClick={onBack} className="mt-4 w-full text-sm text-slate-500">Back to login</button></section></main>;
}

export default function AuthPage({ onAuthenticated, resetToken, onResetBack }: { onAuthenticated: (user: User) => void; resetToken?: string | null; onResetBack?: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (resetToken) return <ResetPassword token={resetToken} onBack={onResetBack || (() => undefined)} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const body = mode === "signup" ? { name, email, password } : { email, password };
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      onAuthenticated(data.user as User);
    } catch (e) { setError(e instanceof Error ? e.message : "Authentication failed."); }
  }

  async function forgot(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(data.message + (data.resetToken ? ` Development reset token: ${data.resetToken}` : ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create reset request."); }
  }

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="w-full max-w-md"><div className="text-center mb-8"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-xl font-bold text-white">ID</div><h1 className="text-3xl font-bold text-slate-900">School ID Maker</h1><p className="mt-2 text-sm text-slate-500">Create and manage professional school ID cards.</p></div><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    {mode !== "forgot" ? <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => { setMode("login"); setError(""); }} className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Login</button><button type="button" onClick={() => { setMode("signup"); setError(""); }} className={`rounded-md px-4 py-2 text-sm font-medium ${mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Sign up</button></div> : <h2 className="mb-6 text-xl font-semibold">Forgot password</h2>}
    {mode === "forgot" ? <form onSubmit={forgot} className="space-y-4"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="you@example.com" />{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}{message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 break-words">{message}</p>}<button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">Send reset link</button><button type="button" onClick={() => setMode("login")} className="w-full text-sm text-slate-500">Back to login</button></form> : <form onSubmit={submit} className="space-y-4">{mode === "signup" && <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Full name" />}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="you@example.com" /><input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Password" />{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white">{mode === "login" ? "Login" : "Create account"}</button>{mode === "login" && <button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="w-full text-sm text-slate-500">Forgot password?</button>}</form>}
  </section></div></main>;
}
