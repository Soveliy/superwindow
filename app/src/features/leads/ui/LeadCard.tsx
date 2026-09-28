import { CalendarClock, ChevronRight, Clock3, LoaderCircle, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LeadSummary } from '@/features/leads/model/leads.types';
import { LeadBadge } from '@/features/leads/ui/LeadBadges';
import { formatLeadDate, formatLeadExpiry, formatMoney, formatMoneyRange, formatVisit } from '@/features/leads/ui/leads-format';

interface LeadCardProps {
  lead: LeadSummary;
  detailHref?: string;
  onTake?: (lead: LeadSummary) => void;
  isTaking?: boolean;
}

export const LeadCard = ({ lead, detailHref = `/leads/${lead.id}`, onTake, isTaking = false }: LeadCardProps) => {
  const financeLabel = lead.serviceType === 'measurement' ? 'Бюджет' : 'Вознаграждение';
  const financeValue =
    lead.serviceType === 'measurement' ? formatMoneyRange(lead.budget) : formatMoney(lead.reward);

  return (
    <article className="overflow-hidden rounded-lg border-2 border-ink-800 bg-surface shadow-md transition-shadow hover:shadow-lg">
      <div className="px-4 pb-6 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <LeadBadge value={lead.status} kind="status" appearance="marketplace" />
          <LeadBadge value={lead.serviceType} kind="service" />
          {lead.status === 'available' ? (
            <span title={formatLeadDate(lead.expiresAt, true)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-error">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formatLeadExpiry(lead.expiresAt)}
            </span>
          ) : null}
        </div>

        <h2 className="mt-3 text-xl font-extrabold leading-tight text-ink-800">{lead.title}</h2>
        <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {lead.city || lead.region}
        </p>
      </div>

      <dl className="grid gap-4 border-y border-slate-300 bg-slate-50 px-4 py-5 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{financeLabel}</dt>
          <dd className="text-right font-mono text-base font-bold tabular-nums text-ink-800">{financeValue}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Контакт</dt>
          <dd className="text-right font-mono font-semibold text-ink-700">{lead.customer.phone}</dd>
        </div>
        {lead.scheduledVisit ? (
          <div className="flex items-start justify-between gap-4">
            <dt className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              План
            </dt>
            <dd className="text-right font-semibold text-ink-700">{formatVisit(lead.scheduledVisit)}</dd>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-4">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Опубликовано</dt>
          <dd className="text-right font-mono text-slate-600">{formatLeadDate(lead.publishedAt)}</dd>
        </div>
      </dl>

      <div className="px-4 pb-4 pt-2">
        <Link
          to={detailHref}
          className="flex min-h-11 items-center justify-center gap-1 rounded-lg text-base font-medium uppercase tracking-wide text-ink-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
          aria-label={`Подробнее о лиде «${lead.title}»`}
        >
          Подробнее
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        {lead.status === 'available' && onTake ? (
          <button
            type="button"
            onClick={() => onTake(lead)}
            disabled={isTaking}
            className="mt-1 inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-lg bg-[#05264b] px-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-md transition-colors hover:bg-[#0a3b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isTaking ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            Забрать лид
          </button>
        ) : null}
      </div>
    </article>
  );
};
