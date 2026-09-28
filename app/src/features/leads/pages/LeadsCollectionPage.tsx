import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LeadsRepositoryError, listLeads, takeLead, type LeadScope, type LeadSummary } from '@/features/leads';
import { ConfirmDialog } from '@/features/leads/ui/ConfirmDialog';
import { LeadCard } from '@/features/leads/ui/LeadCard';
import { LeadFilters, type LeadFilterValue } from '@/features/leads/ui/LeadFilters';
import { LeadPageFrame } from '@/features/leads/ui/LeadPageFrame';
import { LeadsSectionTabs } from '@/features/leads/ui/LeadsSectionTabs';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/features/leads/ui/LeadUiState';
import { UnreadNotificationsAction } from '@/features/leads/ui/UnreadNotificationsAction';
import { getLeadsErrorMessage } from '@/features/leads/ui/leads-errors';

const initialFilters: LeadFilterValue = {
  search: '',
  region: '',
  serviceType: '',
  product: '',
  budget: 'all',
};

const matchesBudget = (lead: LeadSummary, budget: LeadFilterValue['budget']): boolean => {
  if (budget === 'all') {
    return true;
  }

  if (!lead.budget) {
    return false;
  }

  if (budget === 'under-150') {
    return lead.budget.min < 150_000;
  }

  if (budget === '150-300') {
    return lead.budget.max >= 150_000 && lead.budget.min <= 300_000;
  }

  return lead.budget.max > 300_000;
};

const matchesSearch = (lead: LeadSummary, search: string): boolean => {
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  if (!needle) {
    return true;
  }

  return [lead.id, lead.externalId, lead.title, lead.product, lead.city, lead.region]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase('ru-RU').includes(needle));
};

interface LeadsCollectionPageProps {
  scope: LeadScope;
  title: string;
  emptyTitle: string;
  emptyMessage: string;
}

export const LeadsCollectionPage = ({
  scope,
  title,
  emptyTitle,
  emptyMessage,
}: LeadsCollectionPageProps) => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [filters, setFilters] = useState<LeadFilterValue>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [takeCandidate, setTakeCandidate] = useState<LeadSummary | null>(null);
  const [isTaking, setIsTaking] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      setLeads(await listLeads({ scope }));
    } catch (caughtError) {
      setError(getLeadsErrorMessage(caughtError, 'Не удалось загрузить список лидов.'));
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmTake = async () => {
    if (!takeCandidate) {
      return;
    }

    setIsTaking(true);
    setActionError('');
    try {
      const updatedLead = await takeLead(takeCandidate.id, { expectedVersion: takeCandidate.version });
      setTakeCandidate(null);
      navigate(`/leads/${updatedLead.id}`);
    } catch (caughtError) {
      setTakeCandidate(null);
      if (caughtError instanceof LeadsRepositoryError && caughtError.code === 'conflict') {
        setActionError('Этот лид уже забрал другой дилер. Витрина обновлена.');
        await load();
      } else {
        setActionError(getLeadsErrorMessage(caughtError, 'Не удалось взять лид.'));
      }
    } finally {
      setIsTaking(false);
    }
  };

  const regions = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.region).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ru')),
    [leads],
  );

  const products = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.product).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ru')),
    [leads],
  );

  const visibleLeads = useMemo(
    () =>
      leads.filter(
        (lead) =>
          matchesSearch(lead, filters.search) &&
          (!filters.region || lead.region === filters.region) &&
          (!filters.serviceType || lead.serviceType === filters.serviceType) &&
          (!filters.product || lead.product === filters.product) &&
          matchesBudget(lead, filters.budget),
      ),
    [filters, leads],
  );

  return (
    <LeadPageFrame title={title} backTo="/orders" action={<UnreadNotificationsAction />} showBottomNav>
      <LeadsSectionTabs />
      <LeadFilters value={filters} regions={regions} products={products} onChange={setFilters} resultCount={visibleLeads.length} />
      {actionError ? <InlineNotice tone="error" className="mt-3">{actionError}</InlineNotice> : null}

      {isLoading ? <LoadingState label="Загружаем лиды…" /> : null}
      {!isLoading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && visibleLeads.length === 0 ? (
        <EmptyState
          title={leads.length === 0 ? emptyTitle : 'По вашему запросу ничего не найдено'}
          message={leads.length === 0 ? emptyMessage : 'Измените или сбросьте фильтры, чтобы увидеть другие лиды.'}
          action={
            leads.length === 0 && scope !== 'available' ? (
              <Link
                to="/leads"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#052c56] px-4 text-sm font-semibold text-white"
              >
                Открыть витрину
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {!isLoading && !error && visibleLeads.length > 0 ? (
        <div className="mt-3 space-y-4" aria-live="polite">
          {visibleLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onTake={scope === 'available' ? setTakeCandidate : undefined}
              isTaking={isTaking && takeCandidate?.id === lead.id}
            />
          ))}
        </div>
      ) : null}

      {takeCandidate ? (
        <ConfirmDialog
          title="Забрать этот лид?"
          description="Лид закрепится за вами, контакты откроются. Плановую дату нужно указать в течение 24 часов, иначе лид вернётся на витрину."
          confirmLabel="Забрать"
          onConfirm={() => void confirmTake()}
          onCancel={() => setTakeCandidate(null)}
          isPending={isTaking}
        />
      ) : null}
    </LeadPageFrame>
  );
};
