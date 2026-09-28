import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  listWorkOrders,
  type WorkOrderScope,
  type WorkOrderSummary,
  type WorkOrderType,
} from '@/features/leads';
import { LeadPageFrame } from '@/features/leads/ui/LeadPageFrame';
import { LeadsSectionTabs } from '@/features/leads/ui/LeadsSectionTabs';
import { EmptyState, ErrorState, LoadingState } from '@/features/leads/ui/LeadUiState';
import { UnreadNotificationsAction } from '@/features/leads/ui/UnreadNotificationsAction';
import { WorkOrderCard } from '@/features/leads/ui/WorkOrderCard';
import { getLeadsErrorMessage } from '@/features/leads/ui/leads-errors';

export const WorkOrdersPage = () => {
  const [scope, setScope] = useState<WorkOrderScope>('active');
  const [type, setType] = useState<'' | WorkOrderType>('');
  const [search, setSearch] = useState('');
  const [workOrders, setWorkOrders] = useState<WorkOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const loadSequenceRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setError('');

    try {
      const loadedWorkOrders = await listWorkOrders({ scope });
      if (sequence === loadSequenceRef.current) {
        setWorkOrders(loadedWorkOrders);
      }
    } catch (caughtError) {
      if (sequence === loadSequenceRef.current) {
        setError(getLeadsErrorMessage(caughtError, 'Не удалось загрузить список работ.'));
      }
    } finally {
      if (sequence === loadSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [scope]);

  useEffect(() => {
    void load();
    return () => {
      loadSequenceRef.current += 1;
    };
  }, [load]);

  const visibleWorkOrders = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru-RU');

    return workOrders.filter((workOrder) => {
      if (type && workOrder.type !== type) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return [workOrder.id, workOrder.displayId, workOrder.customer.name, workOrder.product, workOrder.destination.city]
        .some((value) => value.toLocaleLowerCase('ru-RU').includes(needle));
    });
  }, [search, type, workOrders]);

  return (
    <LeadPageFrame title="Работы" backTo="/orders" action={<UnreadNotificationsAction />} showBottomNav>
      <LeadsSectionTabs />

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Статус работ">
        {([
          ['active', 'Активные'],
          ['archive', 'Архив'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={`h-10 rounded-lg text-sm font-semibold transition-colors ${
              scope === value ? 'bg-surface text-ink-800 shadow-sm' : 'text-slate-500 hover:text-ink-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label className="relative block">
          <span className="sr-only">Поиск по работам</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Номер, клиент или товар"
            className="h-11 w-full rounded-xl border border-slate-300 bg-slate-100 pl-10 pr-9 text-sm text-ink-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as '' | WorkOrderType)}
          className="h-11 rounded-xl border border-slate-300 bg-surface px-3 text-sm font-semibold text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          aria-label="Тип работы"
        >
          <option value="">Все типы</option>
          <option value="installation">Монтаж</option>
          <option value="delivery">Доставка</option>
        </select>
      </div>

      <p className="mt-2 min-h-5 text-xs text-slate-500">Найдено: {visibleWorkOrders.length}</p>

      {isLoading ? <LoadingState label="Загружаем работы…" /> : null}
      {!isLoading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!isLoading && !error && visibleWorkOrders.length === 0 ? (
        <EmptyState
          title={workOrders.length === 0 ? (scope === 'active' ? 'Активных работ пока нет' : 'Архив работ пуст') : 'Ничего не найдено'}
          message={
            workOrders.length === 0
              ? 'После назначения даты монтаж или доставка появятся в этом разделе.'
              : 'Измените поиск или выберите другой тип работы.'
          }
          action={
            scope === 'active' && workOrders.length === 0 ? (
              <Link to="/leads/my" className="inline-flex h-10 items-center rounded-xl bg-[#052c56] px-4 text-sm font-semibold text-white">
                Перейти к моим лидам
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {!isLoading && !error && visibleWorkOrders.length > 0 ? (
        <div className="mt-3 space-y-4" aria-live="polite">
          {visibleWorkOrders.map((workOrder) => (
            <WorkOrderCard key={workOrder.id} workOrder={workOrder} />
          ))}
        </div>
      ) : null}
    </LeadPageFrame>
  );
};
