import React, { useState } from "react";
import { TrendingUp, ArrowUpRight } from "lucide-react";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;      // HEX or SVG color
  twBg: string;       // Tailwind bg class for legends
  twText: string;     // Tailwind text class
}

interface DonutChartProps {
  data: DonutSegment[];
  totalLabel?: string;
  size?: number;
}

export function DonutChart({ data, totalLabel = "Total", size = 200 }: DonutChartProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  // SVG parameters
  const center = size / 2;
  const strokeWidth = 26;
  const radius = center - strokeWidth / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  // Calculate segment offsets
  let accumulatedAngle = 0;
  const segments = data.map((seg) => {
    const percentage = total > 0 ? (seg.value / total) * 100 : 0;
    const strokeDasharray = `${(seg.value / (total || 1)) * circumference} ${circumference}`;
    const strokeDashoffset = -accumulatedAngle * (circumference / 100);
    accumulatedAngle += percentage;

    return {
      ...seg,
      percentage: Math.round(percentage),
      strokeDasharray,
      strokeDashoffset,
    };
  });

  const activeSegment = hoveredId ? segments.find((s) => s.id === hoveredId) : null;

  return (
    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-around gap-6">
      {/* Donut SVG */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] transition-all duration-300"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {total === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#e2e8f0"
              strokeWidth={strokeWidth}
              strokeDasharray="6 6"
            />
          ) : (
            segments.map((seg) => {
              const isHovered = hoveredId === seg.id;
              return (
                <circle
                  key={seg.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 5 : strokeWidth}
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  strokeLinecap="round"
                  className="cursor-pointer transition-all duration-300 hover:opacity-90"
                  onMouseEnter={() => setHoveredId(seg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    filter: isHovered ? "drop-shadow(0 4px 6px rgba(0,0,0,0.15))" : "none",
                  }}
                />
              );
            })
          )}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          {activeSegment ? (
            <>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {activeSegment.label}
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-0.5">
                {activeSegment.value}
              </span>
              <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full mt-1">
                {activeSegment.percentage}%
              </span>
            </>
          ) : (
            <>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                {totalLabel}
              </span>
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                {total}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 font-medium">Records</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2.5 min-w-[170px] w-full sm:w-auto">
        {segments.map((seg) => {
          const isHovered = hoveredId === seg.id;
          return (
            <div
              key={seg.id}
              onMouseEnter={() => setHoveredId(seg.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                isHovered ? "bg-slate-100/90 shadow-sm" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-sm font-medium text-slate-700">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{seg.value}</span>
                <span className="text-xs font-semibold text-slate-400">
                  ({seg.percentage}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ActivityMonth {
  month: string;
  prescriptions: number;
  reports: number;
  total: number;
}

interface ActivityBarChartProps {
  data: ActivityMonth[];
  maxCount?: number;
}

export function ActivityBarChart({ data }: ActivityBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const highestCount = Math.max(...data.map((d) => d.total), 4);
  // Round to nice scale
  const scaleMax = Math.ceil(highestCount / 2) * 2;

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
        <div>
          <h4 className="text-base font-bold text-slate-900">Document Upload Activity</h4>
          <p className="text-xs text-slate-500 mt-0.5">Records added over recent months</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-600" />
            <span className="text-slate-600 font-medium">Prescriptions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-400" />
            <span className="text-slate-600 font-medium">Reports</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative pt-6 pb-2">
        {/* Background Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] text-slate-300 font-mono pl-6">
          <div className="border-b border-dashed border-slate-100 w-full flex justify-end pr-1">
            <span>{scaleMax}</span>
          </div>
          <div className="border-b border-dashed border-slate-100 w-full flex justify-end pr-1">
            <span>{Math.round(scaleMax * 0.5)}</span>
          </div>
          <div className="border-b border-slate-200 w-full flex justify-end pr-1">
            <span>0</span>
          </div>
        </div>

        {/* Bars Container */}
        <div className="relative z-10 flex items-end justify-around h-44 pl-6 pr-2">
          {data.map((item, index) => {
            const isHovered = hoveredIndex === index;
            const totalHeightPct = scaleMax > 0 ? (item.total / scaleMax) * 100 : 0;
            const prescPct = item.total > 0 ? (item.prescriptions / item.total) * 100 : 0;
            const reportPct = item.total > 0 ? (item.reports / item.total) * 100 : 0;

            return (
              <div
                key={item.month}
                className="flex flex-col items-center flex-1 max-w-[54px] group relative cursor-pointer"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Floating Tooltip */}
                {isHovered && (
                  <div className="absolute -top-14 z-30 bg-slate-900 text-white text-xs rounded-xl py-1.5 px-2.5 shadow-xl whitespace-nowrap pointer-events-none transition-all">
                    <p className="font-bold text-slate-100">{item.month}</p>
                    <div className="flex gap-2 text-[11px] text-slate-300 mt-0.5">
                      <span>Rx: <strong className="text-brand-300">{item.prescriptions}</strong></span>
                      <span>Rep: <strong className="text-teal-300">{item.reports}</strong></span>
                      <span>Total: <strong className="text-white">{item.total}</strong></span>
                    </div>
                    {/* Tooltip beak */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
                  </div>
                )}

                {/* The Bar */}
                <div className="w-full flex flex-col justify-end h-36 relative">
                  <div
                    className={`w-full rounded-t-xl overflow-hidden transition-all duration-300 flex flex-col justify-end shadow-sm ${
                      isHovered ? "ring-2 ring-brand-400 ring-offset-1 scale-[1.03]" : ""
                    }`}
                    style={{
                      height: `${Math.max(totalHeightPct, 6)}%`,
                      opacity: item.total === 0 ? 0.35 : 1,
                    }}
                  >
                    {/* Top segment: Reports */}
                    <div
                      className="bg-gradient-to-t from-teal-500 to-teal-400 transition-all"
                      style={{ height: `${reportPct}%` }}
                    />
                    {/* Bottom segment: Prescriptions */}
                    <div
                      className="bg-gradient-to-t from-brand-700 to-brand-600 transition-all"
                      style={{ height: `${prescPct}%` }}
                    />
                  </div>
                </div>

                {/* X-axis Label */}
                <span
                  className={`mt-2.5 text-xs font-semibold transition-colors ${
                    isHovered ? "text-brand-700" : "text-slate-500"
                  }`}
                >
                  {item.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface InsightMeterItem {
  label: string;
  count: number;
  totalBench?: number;
  icon: React.ReactNode;
  color: string;
  barClass: string;
  description: string;
}

export function InsightMeters({ items }: { items: InsightMeterItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, idx) => {
        const bench = item.totalBench || 20;
        const pct = Math.min(Math.round((item.count / bench) * 100), 100);

        return (
          <div key={idx} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-white shadow-xs text-slate-700">
                  {item.icon}
                </span>
                <div>
                  <p className="text-xs font-bold text-slate-800">{item.label}</p>
                  <p className="text-[11px] text-slate-500">{item.description}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-base font-extrabold text-slate-900">{item.count}</span>
                <span className="text-xs text-slate-400 ml-1 font-medium">extracted</span>
              </div>
            </div>

            {/* Meter Bar */}
            <div className="mt-3 h-2 w-full bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${item.barClass}`}
                style={{ width: `${Math.max(pct, 6)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface HealthMetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  accentBg: string;
  accentText: string;
}

export function HealthMetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendUp = true,
  accentBg,
  accentText,
}: HealthMetricCardProps) {
  return (
    <div className="card p-5 relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-slate-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-2xl ${accentBg} ${accentText} shadow-xs`}>
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-500">{subtitle}</span>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-bold ${
              trendUp ? "text-emerald-600 bg-emerald-50" : "text-slate-500 bg-slate-100"
            } px-2 py-0.5 rounded-full`}
          >
            {trendUp ? <TrendingUp size={12} /> : <ArrowUpRight size={12} />}
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
