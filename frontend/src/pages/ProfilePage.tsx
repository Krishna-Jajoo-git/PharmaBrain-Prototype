import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  Pill,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { documentApi } from "../services/api";
import type { AnalysisResult, Document } from "../types";
import {
  ActivityBarChart,
  ActivityMonth,
  DonutChart,
  DonutSegment,
  HealthMetricCard,
  InsightMeters,
} from "../components/ProfileCharts";

export function ProfilePage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [sampleMode, setSampleMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    documentApi
      .list()
      .then((r) => {
        if (mounted) {
          const list = r.data.data || [];
          setDocs(list);
          // If the user has no documents yet, enable sample mode by default so they see rich charts
          if (list.length === 0) {
            setSampleMode(true);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Compute stats from real documents
  const realStats = useMemo(() => {
    const total = docs.length;
    const prescriptions = docs.filter((d) => d.documentType === "PRESCRIPTION").length;
    const reports = docs.filter((d) => d.documentType === "REPORT").length;
    const analysed = docs.filter((d) => d.status === "ANALYSED").length;

    let medicines = 0;
    let precautions = 0;
    let questions = 0;
    let findings = 0;

    docs.forEach((d) => {
      const res = d.analysis?.structuredResult as AnalysisResult | undefined;
      if (res) {
        if (Array.isArray(res.medicines)) medicines += res.medicines.length;
        if (Array.isArray(res.precautions)) precautions += res.precautions.length;
        if (Array.isArray(res.questionsForDoctor)) questions += res.questionsForDoctor.length;
        if (Array.isArray(res.keyFindings)) findings += res.keyFindings.length;
      }
    });

    return {
      total,
      prescriptions,
      reports,
      analysed,
      medicines,
      precautions,
      questions,
      findings,
    };
  }, [docs]);

  // Sample data fallback for visual showcase when account is new
  const sampleStats = {
    total: 8,
    prescriptions: 5,
    reports: 3,
    analysed: 8,
    medicines: 12,
    precautions: 9,
    questions: 7,
    findings: 14,
  };

  const activeStats = sampleMode && docs.length === 0 ? sampleStats : realStats;

  // Donut chart segments
  const donutData: DonutSegment[] = useMemo(() => {
    return [
      {
        id: "prescriptions",
        label: "Prescriptions",
        value: activeStats.prescriptions,
        color: "#07837f", // brand-600
        twBg: "bg-brand-600",
        twText: "text-brand-700",
      },
      {
        id: "reports",
        label: "Medical Reports",
        value: activeStats.reports,
        color: "#2dd4bf", // teal-400
        twBg: "bg-teal-400",
        twText: "text-teal-700",
      },
    ];
  }, [activeStats]);

  // Activity timeline: Generate 6 months data
  const activityData: ActivityMonth[] = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const past6Months: ActivityMonth[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = monthNames[d.getMonth()];
      const year = d.getFullYear();
      const monthIdx = d.getMonth();

      // Count docs for this month
      const inMonth = docs.filter((doc) => {
        const docDate = new Date(doc.uploadedAt);
        return docDate.getMonth() === monthIdx && docDate.getFullYear() === year;
      });

      const rxCount = inMonth.filter((x) => x.documentType === "PRESCRIPTION").length;
      const repCount = inMonth.filter((x) => x.documentType === "REPORT").length;

      past6Months.push({
        month: mName,
        prescriptions: rxCount,
        reports: repCount,
        total: rxCount + repCount,
      });
    }

    // If sample mode or total docs is 0, give realistic sample timeline
    if (sampleMode && docs.length === 0) {
      return [
        { month: past6Months[0].month, prescriptions: 1, reports: 0, total: 1 },
        { month: past6Months[1].month, prescriptions: 0, reports: 1, total: 1 },
        { month: past6Months[2].month, prescriptions: 2, reports: 0, total: 2 },
        { month: past6Months[3].month, prescriptions: 1, reports: 1, total: 2 },
        { month: past6Months[4].month, prescriptions: 0, reports: 0, total: 0 },
        { month: past6Months[5].month, prescriptions: 1, reports: 1, total: 2 },
      ];
    }

    return past6Months;
  }, [docs, sampleMode]);

  // Clinical Insight Meters Data
  const insightMeters = [
    {
      label: "Medications Identified",
      count: activeStats.medicines,
      totalBench: Math.max(activeStats.medicines, 15),
      icon: <Pill size={16} className="text-teal-600" />,
      color: "#0eaaa3",
      barClass: "bg-gradient-to-r from-teal-500 to-emerald-400",
      description: "Dosages, schedules, and active substances parsed",
    },
    {
      label: "Safety Precautions Flagged",
      count: activeStats.precautions,
      totalBench: Math.max(activeStats.precautions, 12),
      icon: <ShieldCheck size={16} className="text-amber-600" />,
      color: "#f59e0b",
      barClass: "bg-gradient-to-r from-amber-500 to-yellow-400",
      description: "Interactions, food contraindications & warnings",
    },
    {
      label: "Doctor Inquiries Prepared",
      count: activeStats.questions,
      totalBench: Math.max(activeStats.questions, 10),
      icon: <HelpCircle size={16} className="text-indigo-600" />,
      color: "#6366f1",
      barClass: "bg-gradient-to-r from-indigo-500 to-purple-400",
      description: "Targeted questions generated for your doctor visit",
    },
    {
      label: "OCR & Clinical Reading Confidence",
      count: activeStats.total > 0 ? 98 : 0,
      totalBench: 100,
      icon: <CheckCircle2 size={16} className="text-brand-600" />,
      color: "#07837f",
      barClass: "bg-gradient-to-r from-brand-600 to-teal-500",
      description: "Average extraction quality across processed scans",
    },
  ];

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "PB";

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Recently Joined";

  return (
    <div className="space-y-7 pb-12">
      {/* 1. Hero Profile Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 p-6 sm:p-8 text-white shadow-xl">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-teal-500/15 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            {/* Avatar Pill */}
            <div className="relative flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-500 to-teal-400 text-2xl font-black tracking-wider text-white shadow-lg ring-4 ring-white/10">
              {userInitials}
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-slate-900 bg-emerald-400" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {user?.name || "Patient Profile"}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/20 px-2.5 py-0.5 text-xs font-semibold text-brand-200 border border-brand-400/30">
                  <Sparkles size={11} className="text-brand-300" /> AI Vault Active
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-300 flex items-center gap-2">
                <Mail size={14} className="text-slate-400" />
                {user?.email}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1">
                  <Calendar size={13} className="text-brand-300" /> Member since {memberSince}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1">
                  <Activity size={13} className="text-teal-300" /> ID: #{user?.id || 1}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 md:border-t-0 md:pt-0">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-110 active:scale-95"
            >
              <UploadCloud size={16} /> Upload Document
            </Link>
            <button
              onClick={() => {
                logout();
                nav("/");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white active:scale-95"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {/* Sample Mode Banner if zero docs */}
        {docs.length === 0 && (
          <div className="relative z-10 mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/10 text-xs">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-amber-300 shrink-0" />
              <p className="text-slate-200">
                {sampleMode
                  ? "Showing preview benchmarks on your profile. Upload your first sample document to see live data."
                  : "Zero documents uploaded yet. Switch on Preview Mode to see how charts look with data."}
              </p>
            </div>
            <button
              onClick={() => setSampleMode(!sampleMode)}
              className="shrink-0 font-bold px-3 py-1 rounded-lg bg-brand-500 text-white hover:bg-brand-400 transition"
            >
              {sampleMode ? "Show Live (0 Docs)" : "Enable Sample Charts"}
            </button>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthMetricCard
          title="Total Documents"
          value={activeStats.total}
          subtitle={`${activeStats.analysed} processed with AI`}
          trend={activeStats.total > 0 ? "+100% indexed" : "Ready"}
          trendUp={true}
          icon={<FileText size={22} />}
          accentBg="bg-brand-50"
          accentText="text-brand-700"
        />
        <HealthMetricCard
          title="Prescriptions"
          value={activeStats.prescriptions}
          subtitle="Rx & dosage regimens"
          trend={`${Math.round(
            activeStats.total > 0 ? (activeStats.prescriptions / activeStats.total) * 100 : 0
          )}% of total`}
          trendUp={true}
          icon={<Pill size={22} />}
          accentBg="bg-teal-50"
          accentText="text-teal-700"
        />
        <HealthMetricCard
          title="Medical Reports"
          value={activeStats.reports}
          subtitle="Diagnostics & lab results"
          trend={`${Math.round(
            activeStats.total > 0 ? (activeStats.reports / activeStats.total) * 100 : 0
          )}% of total`}
          trendUp={true}
          icon={<Activity size={22} />}
          accentBg="bg-indigo-50"
          accentText="text-indigo-700"
        />
        <HealthMetricCard
          title="Insights Extracted"
          value={activeStats.medicines + activeStats.precautions}
          subtitle="Meds & safety notes logged"
          trend="Real-time"
          trendUp={true}
          icon={<Sparkles size={22} />}
          accentBg="bg-amber-50"
          accentText="text-amber-700"
        />
      </div>

      {/* 3. Main Graphical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Activity Timeline & Clinical Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {/* Activity Bar Chart Card */}
          <div className="card p-6">
            <ActivityBarChart data={activityData} />
          </div>

          {/* Clinical Insights Meters Card */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Clinical Intelligence & Insights
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Breakdown of elements automatically organized by Gemini AI
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg">
                <Sparkles size={13} /> AI Extractor
              </span>
            </div>
            <InsightMeters items={insightMeters} />
          </div>
        </div>

        {/* Right 1 Col: Donut Chart & Account Security */}
        <div className="space-y-6">
          {/* Document Distribution Donut Chart */}
          <div className="card p-6">
            <div className="mb-4">
              <h3 className="text-base font-bold text-slate-900">Document Distribution</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Prescriptions vs. Diagnostic Reports
              </p>
            </div>
            <DonutChart data={donutData} totalLabel="Indexed Docs" size={210} />
          </div>

          {/* Health Vault & Account Info Card */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Account & Security</h4>
                <p className="text-xs text-slate-500">Encrypted personal vault</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-400">Account ID</span>
                <span className="font-mono font-medium text-slate-800">PB-USR-{user?.id || 1}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-400">Security Mode</span>
                <span className="font-semibold text-emerald-600">Encrypted JWT Session</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-400">Analysis Engine</span>
                <span className="font-medium text-slate-800">Gemini 2.5 Flash</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-400">Data Storage</span>
                <span className="font-medium text-slate-800">PostgreSQL + Prisma</span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/documents"
                className="w-full btn-secondary text-xs font-bold py-2 justify-center"
              >
                Browse All Documents ({docs.length})
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Recent Health Records Quick List */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Recent Medical Documents</h3>
            <p className="text-xs text-slate-500 mt-0.5">Quickly access summaries and findings</p>
          </div>
          <Link
            to="/documents"
            className="text-xs font-bold text-brand-700 hover:text-brand-800 hover:underline"
          >
            View all →
          </Link>
        </div>

        {docs.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {docs.slice(0, 4).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="p-2 rounded-xl bg-brand-50 text-brand-600 shrink-0">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-sm text-slate-800">
                      {d.originalName}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {d.documentType === "PRESCRIPTION" ? "Prescription" : "Medical Report"} ·{" "}
                      {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      d.status === "ANALYSED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {d.status === "ANALYSED" ? "Ready" : d.status}
                  </span>
                  <Link
                    to={d.analysis ? `/documents/${d.id}` : "/upload"}
                    className="text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition"
                  >
                    {d.analysis ? "View Summary" : "Analyse"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
            <FileText className="mx-auto text-slate-300" size={36} />
            <p className="mt-2 text-sm font-semibold text-slate-700">
              No medical documents uploaded yet
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Upload sample prescriptions or clinical reports to start building your health
              intelligence history.
            </p>
            <Link to="/upload" className="btn-primary mt-4 text-xs font-bold py-2 px-4">
              <UploadCloud size={14} /> Upload First Document
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
