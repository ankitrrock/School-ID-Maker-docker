import { useEffect, useState, type ComponentType } from "react";
import { modules as discoveredModules } from "./.generated/mockup-components";
import AuthPage, { getSession, logout } from "./components/auth/AuthPage";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;
type User = { id: string; name: string; email: string };

function _resolveComponent(mod: Record<string, unknown>, name: string): ComponentType | undefined {
  const fns = Object.values(mod).filter((v) => typeof v === "function") as ComponentType[];
  return (mod.default as ComponentType) || (mod.Preview as ComponentType) || (mod[name] as ComponentType) || fns[fns.length - 1];
}

function PreviewRenderer({ componentPath, modules }: { componentPath: string; modules: ModuleMap }) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; setComponent(null); setError(null); const load = async () => { const loader = modules[`./components/mockups/${componentPath}.tsx`]; if (!loader) { setError(`No component found at ${componentPath}.tsx`); return; } try { const mod = await loader(); if (cancelled) return; const name = componentPath.split("/").pop()!; const comp = _resolveComponent(mod, name); if (!comp) { setError(`No exported React component found in ${componentPath}.tsx`); return; } setComponent(() => comp); } catch (e) { if (!cancelled) setError(`Failed to load preview.\n${e instanceof Error ? e.message : String(e)}`); } }; void load(); return () => { cancelled = true; }; }, [componentPath, modules]);
  if (error) return <pre style={{ color: "red", padding: "2rem" }}>{error}</pre>;
  if (!Component) return null;
  return <Component />;
}

function getPreviewPath(): string | null { const { pathname } = window.location; const match = pathname.match(/^\/preview\/(.+)$/); return match ? match[1] : null; }
function getResetToken(): string | null { return new URLSearchParams(window.location.search).get("token"); }

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <main className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"><div><h1 className="text-xl font-bold text-slate-900">School ID Maker</h1><p className="text-xs text-slate-500">ID card management</p></div><div className="flex items-center gap-4"><span className="text-sm text-slate-600">{user.name}</span><button onClick={onLogout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Logout</button></div></div></header><section className="mx-auto max-w-6xl px-6 py-12"><div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h2 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h2><p className="mt-2 text-slate-500">You are signed in as {user.email}.</p><div className="mt-8 grid gap-4 md:grid-cols-3">{[["Create ID Card", "Design a new student or staff ID card."], ["Students", "Manage student records and card data."], ["Templates", "Choose and customize ID card templates."]].map(([title, text]) => <div key={title} className="rounded-xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p></div>)}</div></div></section></main>;
}

function App() {
  const previewPath = getPreviewPath();
  const resetToken = getResetToken();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!previewPath);

  useEffect(() => { if (previewPath || resetToken) { setLoading(false); return; } getSession().then(setUser).finally(() => setLoading(false)); }, [previewPath, resetToken]);

  if (previewPath) return <PreviewRenderer componentPath={previewPath} modules={discoveredModules} />;
  if (resetToken) return <AuthPage onAuthenticated={setUser} resetToken={resetToken} onResetBack={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }} />;
  if (loading) return <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading...</main>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;
  return <Dashboard user={user} onLogout={async () => { await logout(); setUser(null); }} />;
}

export default App;
