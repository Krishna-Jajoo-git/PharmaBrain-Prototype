import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Logo } from "../components/Logo";
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/api";
export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (register && form.password !== form.confirm)
      return setError("Passwords do not match.");
    setBusy(true);
    try {
      const r = register
        ? await authApi.register({
            name: form.name,
            email: form.email,
            password: form.password,
          })
        : await authApi.login({ email: form.email, password: form.password });
      login(r.data.data.token, r.data.data.user);
      navigate("/dashboard");
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? e.response?.data?.message || "Unable to continue."
          : "Unable to continue.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-brand-50 p-5">
      <form onSubmit={submit} className="card w-full max-w-md p-7">
        <Logo />
        <h1 className="mt-8 text-2xl font-bold">
          {register ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {register
            ? "Start exploring the academic prototype."
            : "Sign in to your PharmaBrain workspace."}
        </p>
        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-6 space-y-4">
          {register && (
            <Field
              label="Full name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
            />
          )}
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
          />
          {register && (
            <Field
              label="Confirm password"
              type="password"
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
            />
          )}
        </div>
        <button disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "Please wait…" : register ? "Create account" : "Login"}
        </button>
        <p className="mt-5 text-center text-sm text-slate-600">
          {register ? "Already have an account? " : "New to PharmaBrain? "}
          <Link
            className="font-semibold text-brand-700"
            to={register ? "/login" : "/register"}
          >
            {register ? "Login" : "Create an account"}
          </Link>
        </p>
      </form>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        required
        minLength={type === "password" ? 6 : undefined}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1.5"
      />
    </label>
  );
}
