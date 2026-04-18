import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { getRemoteOrders, type RemoteOrderListItem } from '@/features/orders/api/order-rest';
import { getOrderStatusUi } from '@/features/orders/model/order-status';
import { type OrderStatus } from '@/features/orders/model/orders.mock';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';

type OrdersFilter = 'all' | OrderStatus;

interface FilterOption {
  id: OrdersFilter;
  label: string;
}

const filterOptions: FilterOption[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Расчет' },
  { id: 'in_progress', label: 'В производстве' },
  { id: 'ready', label: 'Монтаж' },
  { id: 'paid', label: 'Оплачены' },
];

const normalizeSearchValue = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');
const normalizeDigits = (value: string): string => value.replace(/\D/g, '');
const emptyDateLabel = 'Не назначена';
const formatDateLabel = (value: string): string => value.trim() || emptyDateLabel;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Не удалось загрузить список заказов.';
};

const OrderCard = ({ order }: { order: RemoteOrderListItem }) => {
  const status = getOrderStatusUi(order.status);
  const amount = order.amount === null ? '—' : formatCurrency(order.amount);
  const productItems = order.items.filter((item) => item.trim().length > 0);
  const shouldHideMeta = order.subtitle.trim() === 'Ожидание расчета' && order.note.trim() === 'Оценка';

  return (
    <Link
      to={`/orders/${order.routeId}`}
      className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[30px] font-extrabold leading-none tracking-tight text-ink-800">{order.displayId}</p>
          <p className="mt-1 text-sm text-slate-500">
            {order.date} · {order.customer}
          </p>
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-1 text-[12px] font-bold uppercase tracking-wide ${status.badgeClassName}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Дата замера</p>
          <p className="mt-1 font-bold text-ink-700">{formatDateLabel(order.measurementDate)}</p>
        </div>
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Дата изготовления</p>
          <p className="mt-1 font-bold text-ink-700">{formatDateLabel(order.productionDate)}</p>
        </div>
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 col-span-full">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Дата монтажа</p>
          <p className="mt-1 font-bold text-ink-700">{formatDateLabel(order.installationDate)}</p>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs">
        <p className="font-semibold uppercase tracking-wide text-slate-400">Список товаров</p>
        {productItems.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm font-medium text-ink-700">
            {productItems.map((item, index) => (
              <li key={`${order.routeId}-product-${index}`} className="truncate">
                • {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 font-medium text-slate-500">Товары не добавлены</p>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        {!shouldHideMeta ? (
          <div>
            <p className="text-sm font-medium text-slate-500">{order.subtitle}</p>
            <p className="mt-1 text-xs text-slate-400">{order.note}</p>
          </div>
        ) : null}
        <div className="ml-auto text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {order.amount === null ? 'Оценка' : 'Сумма'}
          </p>
          <p className="text-[36px] font-extrabold leading-none tracking-tight text-ink-800">{amount}</p>
        </div>
      </div>
    </Link>
  );
};

export const OrdersPage = () => {
  const navigate = useNavigate();
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<OrdersFilter>('all');
  const [orders, setOrders] = useState<RemoteOrderListItem[]>([]);
  const [isLoadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const normalizedQuery = normalizeSearchValue(orderSearchQuery);
  const normalizedDigitsQuery = normalizeDigits(normalizedQuery);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        setLoadingOrders(true);
        setOrdersError(null);
        const nextOrders = await getRemoteOrders();

        if (isCancelled) {
          return;
        }

        setOrders(nextOrders);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setOrdersError(getErrorMessage(error));
        setOrders([]);
      } finally {
        if (!isCancelled) {
          setLoadingOrders(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const statusCounts = useMemo(() => {
    const initialCounts: Record<OrdersFilter, number> = {
      all: orders.length,
      new: 0,
      in_progress: 0,
      ready: 0,
      paid: 0,
    };

    return orders.reduce((counts, order) => {
      counts[order.status] += 1;
      return counts;
    }, initialCounts);
  }, [orders]);

  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesStatus = activeFilter === 'all' ? true : order.status === activeFilter;

        if (!matchesStatus) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = [order.displayId, order.code, order.customer]
          .map((item) => normalizeSearchValue(item))
          .join(' ');
        const digitsHaystack = [order.displayId, order.code].map((item) => normalizeDigits(item)).join('');

        return haystack.includes(normalizedQuery) || (normalizedDigitsQuery ? digitsHaystack.includes(normalizedDigitsQuery) : false);
      }),
    [activeFilter, normalizedDigitsQuery, normalizedQuery, orders],
  );

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <section className="relative min-h-[calc(100vh-1.5rem)] flex-1 px-4 pb-36 pt-5">
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-[42px] font-extrabold leading-none tracking-tight text-ink-800">Заказы</h1>
          </header>

          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={orderSearchQuery}
              onChange={(event) => setOrderSearchQuery(event.target.value)}
              placeholder="Поиск по номеру заказа или имени клиента..."
              className="h-11 flex-1 border-none bg-transparent text-sm text-ink-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filterOptions.map((filterOption) => {
              const isActive = activeFilter === filterOption.id;

              return (
                <button
                  key={filterOption.id}
                  type="button"
                  onClick={() => setActiveFilter(filterOption.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full whitespace-nowrap border px-4 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-brand-400 bg-brand-100 text-ink-800'
                      : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-ink-700',
                  )}
                >
                  <span>{filterOption.label}</span>
                  <span
                    className={cn(
                      'inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold',
                      isActive
                        ? 'border-brand-300 bg-brand-50 text-ink-800'
                        : 'border-slate-300 bg-slate-50 text-slate-500',
                    )}
                  >
                    {statusCounts[filterOption.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {isLoadingOrders ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
              Загружаем заказы...
            </div>
          ) : ordersError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-600">
              {ordersError}
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <OrderCard key={order.routeId} order={order} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
              По вашему запросу заказы не найдены
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/orders/new', { state: { resetCalculatorPositions: true } })}
            className="fixed bottom-20 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-100 transition-colors hover:bg-slate-100"
            aria-label="Создать заказ"
          >
            <Plus className="h-7 w-7" />
          </button>
        </section>
        <BottomNav />
      </main>
    </div>
  );
};
