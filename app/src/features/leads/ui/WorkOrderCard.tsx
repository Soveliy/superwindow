import { CalendarClock, ChevronRight, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WorkOrderSummary } from '@/features/leads/model/leads.types';
import { LeadBadge } from '@/features/leads/ui/LeadBadges';
import { formatMoney, formatVisit } from '@/features/leads/ui/leads-format';

interface WorkOrderCardProps {
  workOrder: WorkOrderSummary;
}

export const WorkOrderCard = ({ workOrder }: WorkOrderCardProps) => (
  <article className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-50 shadow-sm transition-shadow hover:shadow-md">
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xl font-extrabold text-ink-800">{workOrder.displayId}</p>
          <LeadBadge value={workOrder.type} kind="service" />
        </div>
        <LeadBadge value={workOrder.status} kind="status" />
      </div>

      <p className="mt-3 font-extrabold text-ink-800">{workOrder.customer.name}</p>
      <a
        href={`tel:${workOrder.customer.phone.replace(/[^+\d]/g, '')}`}
        className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:underline"
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
        {workOrder.customer.phone}
      </a>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">{workOrder.product}</p>
      <p className="mt-2 inline-flex items-start gap-1 text-sm text-slate-500">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {workOrder.destination.address || [workOrder.destination.city, workOrder.destination.region].filter(Boolean).join(', ')}
      </p>
    </div>

    <dl className="grid grid-cols-2 gap-3 border-y border-slate-200 bg-surface/60 px-4 py-3">
      <div>
        <dt className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          План
        </dt>
        <dd className="mt-1 text-sm font-semibold text-ink-700">{formatVisit(workOrder.plannedVisit)}</dd>
      </div>
      <div className="text-right">
        <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Вознаграждение</dt>
        <dd className="mt-1 text-sm font-extrabold text-ink-800">{formatMoney(workOrder.reward)}</dd>
      </div>
    </dl>

    <Link
      to={`/work-orders/${workOrder.id}`}
      className="flex min-h-14 items-center justify-center gap-1 px-4 text-sm font-extrabold uppercase tracking-wide text-ink-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
      aria-label={`Открыть задание ${workOrder.displayId}`}
    >
      Открыть задание
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  </article>
);

