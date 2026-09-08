"use client";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export type Violation = {
  rule: string; severity: "HARD" | "SOFT"; message: string;
  date?: string; slotOrder?: number;
};

export type Report = {
  stats: {
    requested: number;
    scheduled: number;
    patternPlaced?: number;
    perAssignment?: { label: string; required: number; scheduled: number }[];
    unscheduled?: { assignment: string; reason: string }[];
    softScore?: number;
    softBreakdown?: Record<string, number>;
    warnings?: string[];
    feasible?: boolean;
  };
  validation?: {
    hardViolations?: Violation[];
    softViolations?: Violation[];
    countMismatches?: { assignment: string; required: number; scheduled: number }[];
    publishable?: boolean;
    ranAt?: string;
  };
};

const SOFT_LABELS: Record<string, string> = {
  sectionBalance: "Section balance",
  facultyBalance: "Faculty balance",
  afternoonBreak: "Afternoon break",
  subjectSpacing: "Subject spread",
  consecutive: "Consecutive classes",
  gaps: "Idle gaps",
  tailDistribution: "Tail distribution",
  roomFit: "Room fit",
};

/**
 * The generation result, stated plainly.
 *
 * The headline is deliberately blunt about the two things that decide whether a
 * timetable can go live: are there zero hard violations, and does every
 * assignment have exactly the number of sessions it asked for. A partial result
 * is never dressed up as a success.
 */
export function GenerationReport({ report }: { report: Report }) {
  const s = report.stats ?? { requested: 0, scheduled: 0 };
  const v = report.validation ?? {};

  const hard = v.hardViolations ?? [];
  const soft = v.softViolations ?? [];
  const mismatches = v.countMismatches ?? [];
  const unscheduled = s.unscheduled ?? [];
  const warnings = s.warnings ?? [];
  const publishable = !!v.publishable;

  const pct = s.requested ? Math.round((s.scheduled / s.requested) * 100) : 0;
  const breakdown = Object.entries(s.softBreakdown ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="mb-4 overflow-hidden rounded-md border border-rule bg-sheet shadow-hair">
      {/* Headline */}
      <div className={cn(
        "flex flex-wrap items-center gap-3 border-b px-4 py-3",
        publishable ? "border-moss-line bg-moss-soft/50" : "border-ochre-line bg-ochre-soft/50"
      )}>
        {publishable ? (
          <CheckCircle2 className="size-4 shrink-0 text-moss" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-ochre" />
        )}
        <p className={cn("text-[0.875rem] font-medium", publishable ? "text-moss" : "text-ochre")}>
          {publishable
            ? "Valid — every assignment has exactly its required sessions, with no hard violations."
            : hard.length > 0
            ? `${hard.length} hard constraint violation${hard.length === 1 ? "" : "s"} — this cannot be published.`
            : mismatches.length > 0
            ? `${mismatches.length} assignment${mismatches.length === 1 ? "" : "s"} do not have their exact session count — this cannot be published.`
            : "Not yet validated. Run Validate to check it."}
        </p>
      </div>

      {/* Numbers */}
      <div className="grid divide-rule/70 sm:grid-cols-4 sm:divide-x">
        <Figure label="Sessions requested" value={s.requested} />
        <Figure
          label="Sessions scheduled" value={s.scheduled}
          tone={s.scheduled === s.requested ? "moss" : "claret"}
          sub={s.requested ? `${pct}% of the requirement` : undefined}
        />
        <Figure
          label="Hard violations" value={hard.length}
          tone={hard.length === 0 ? "moss" : "claret"}
        />
        <Figure
          label="Soft score" value={s.softScore ?? 0}
          sub="lower is better"
        />
      </div>

      {/* Hard violations — the blocking list */}
      {hard.length > 0 && (
        <Block
          icon={<ShieldAlert className="size-3.5" />}
          tone="claret"
          title={`Hard violations (${hard.length})`}
        >
          <ul className="space-y-1">
            {hard.slice(0, 8).map((x, i) => (
              <li key={i} className="text-[0.8125rem] leading-snug">
                <span className="font-mono text-[0.66rem] font-semibold uppercase tracking-wide text-claret">
                  {x.rule.replace(/_/g, " ")}
                </span>
                <span className="ml-2">{x.message}</span>
              </li>
            ))}
          </ul>
          {hard.length > 8 && <More n={hard.length - 8} />}
        </Block>
      )}

      {/* Session-count mismatches */}
      {mismatches.length > 0 && (
        <Block
          icon={<TrendingDown className="size-3.5" />}
          tone="claret"
          title={`Session count mismatches (${mismatches.length})`}
        >
          <ul className="space-y-1">
            {mismatches.slice(0, 8).map((m, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[0.8125rem]">
                <span className="font-mono text-[0.72rem] font-semibold">{m.assignment}</span>
                <span className="font-mono text-micro tnum text-claret">
                  {m.scheduled} of {m.required}
                </span>
                <span className="text-muted">
                  {m.scheduled < m.required
                    ? `${m.required - m.scheduled} short`
                    : `${m.scheduled - m.required} too many`}
                </span>
              </li>
            ))}
          </ul>
          {mismatches.length > 8 && <More n={mismatches.length - 8} />}
        </Block>
      )}

      {/* Why they could not be placed */}
      {unscheduled.length > 0 && (
        <Block
          icon={<AlertTriangle className="size-3.5" />}
          tone="ochre"
          title={`Could not be scheduled (${unscheduled.length})`}
        >
          <ul className="space-y-1.5">
            {unscheduled.slice(0, 6).map((u, i) => (
              <li key={i} className="text-[0.8125rem] leading-snug">
                <span className="font-mono text-[0.72rem] font-semibold">{u.assignment}</span>
                <span className="mt-0.5 block text-muted">{u.reason}</span>
              </li>
            ))}
          </ul>
          {unscheduled.length > 6 && <More n={unscheduled.length - 6} />}
        </Block>
      )}

      {/* Soft observations */}
      {(warnings.length > 0 || soft.length > 0) && (
        <Block icon={<Info className="size-3.5" />} tone="neutral" title="Worth a look">
          <ul className="space-y-1">
            {warnings.slice(0, 5).map((w, i) => (
              <li key={`w${i}`} className="text-[0.8125rem] leading-snug text-muted">{w}</li>
            ))}
            {soft.length > 0 && (
              <li className="text-[0.8125rem] leading-snug text-muted">
                {soft.length} soft observation{soft.length === 1 ? "" : "s"} across the term
                {soft[0] ? ` — e.g. ${soft[0].message}` : ""}
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-micro text-muted">
            None of these block publishing.
          </p>
        </Block>
      )}

      {/* Soft score breakdown */}
      {breakdown.length > 0 && (
        <div className="border-t border-rule px-4 py-3">
          <p className="label mb-2">Where the soft score comes from</p>
          <div className="flex flex-wrap gap-1.5">
            {breakdown.map(([key, n]) => (
              <span key={key}
                className="inline-flex items-baseline gap-1.5 rounded-xs border border-rule-strong/60 px-1.5 py-0.5">
                <span className="text-[0.7rem]">{SOFT_LABELS[key] ?? key}</span>
                <span className="font-mono text-[0.66rem] tnum text-muted">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-assignment ledger */}
      {(s.perAssignment?.length ?? 0) > 0 && (
        <details className="border-t border-rule">
          <summary className="cursor-pointer px-4 py-2.5 text-[0.8125rem] text-muted transition-colors hover:text-ink">
            Per-assignment session counts ({s.perAssignment!.length})
          </summary>
          <div className="thin-scroll max-h-64 overflow-y-auto border-t border-rule/70">
            <table className="w-full">
              <tbody className="divide-y divide-rule/60">
                {s.perAssignment!.map((p, i) => {
                  const exact = p.scheduled === p.required;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-1.5 font-mono text-[0.72rem]">{p.label}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-micro tnum">
                        <span className={exact ? "text-moss" : "text-claret"}>{p.scheduled}</span>
                        <span className="text-muted"> / {p.required}</span>
                      </td>
                      <td className="w-8 pr-4 text-right">
                        {exact
                          ? <CheckCircle2 className="ml-auto size-3 text-moss" />
                          : <AlertTriangle className="ml-auto size-3 text-claret" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Figure({
  label, value, sub, tone,
}: { label: string; value: number; sub?: string; tone?: "moss" | "claret" }) {
  return (
    <div className="px-4 py-3">
      <p className="label">{label}</p>
      <p className={cn(
        "mt-0.5 font-display text-[1.5rem] leading-none tnum",
        tone === "moss" ? "text-moss" : tone === "claret" ? "text-claret" : "text-ink"
      )}>
        {value}
      </p>
      {sub && <p className="mt-1 text-micro text-muted">{sub}</p>}
    </div>
  );
}

function Block({
  icon, tone, title, children,
}: {
  icon: React.ReactNode;
  tone: "claret" | "ochre" | "neutral";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-rule px-4 py-3">
      <p className={cn(
        "mb-2 flex items-center gap-1.5 text-[0.8125rem] font-medium",
        tone === "claret" ? "text-claret" : tone === "ochre" ? "text-ochre" : "text-ink"
      )}>
        {icon}{title}
      </p>
      {children}
    </div>
  );
}

function More({ n }: { n: number }) {
  return <p className="mt-1.5 font-mono text-micro text-muted">+{n} more</p>;
}
