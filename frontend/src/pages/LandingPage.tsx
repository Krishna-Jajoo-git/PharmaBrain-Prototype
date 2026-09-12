import { ArrowRight, FileText, LockKeyhole, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
export function LandingPage() {
  const cards = [
    [
      FileText,
      "Prescription Summarisation",
      "Turn clearly readable prescription details into a simple, cautious overview.",
    ],
    [
      Sparkles,
      "Medical Report Insights",
      "Understand visible report information in plain language with AI assistance.",
    ],
    [
      LockKeyhole,
      "Secure User Access",
      "Personal accounts and JWT-protected document history for this local prototype.",
    ],
  ] as const;
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex gap-3">
          <Link className="btn-secondary px-3 py-2" to="/login">
            Login
          </Link>
          <Link className="btn-primary px-3 py-2" to="/register">
            Get Started
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-14 text-center md:pt-24">
        <span className="rounded-full bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700">
          Academic healthcare-AI prototype
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 md:text-6xl">
          Understand Your Medical Documents,{" "}
          <span className="text-brand-600">Simply.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          PharmaBrain helps demonstrate safe, patient-friendly medical document
          summarisation. Upload sample prescriptions or reports, then review a
          structured AI-assisted summary.
        </p>
        <Link to="/register" className="btn-primary mt-8 px-6 py-3">
          Get Started <ArrowRight size={18} />
        </Link>
        <div className="mt-16 grid gap-5 text-left md:grid-cols-3">
          {cards.map(([Icon, title, copy]) => (
            <section key={title} className="card p-6">
              <span className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={22} />
              </span>
              <h2 className="font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            </section>
          ))}
        </div>
        <p className="mx-auto mt-12 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Educational prototype only. PharmaBrain does not diagnose, prescribe,
          or replace qualified healthcare advice. Use SAMPLE / FAKE documents
          only.
        </p>
      </main>
    </div>
  );
}
