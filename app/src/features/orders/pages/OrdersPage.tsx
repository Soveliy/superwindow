import { useMemo, useState } from 'react';
import { Bell, CalendarDays, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { getOrderStatusUi } from '@/features/orders/model/order-status';
import { type OrderStatus, type OrderSummary } from '@/features/orders/model/orders.mock';
import { ordersStorage } from '@/features/orders/model/orders.storage';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';

type OrdersFilter = 'all' | OrderStatus;

interface FilterOption {
  id: OrdersFilter;
  label: string;
}

const filterOptions: FilterOption[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'ready', label: 'Готовы' },
  { id: 'paid', label: 'Оплачены' },
];

const OrderCard = ({ order }: { order: OrderSummary }) => {
  const status = getOrderStatusUi(order.status);
  const amount = order.amount === null ? '—' : formatCurrency(order.amount);

  return (
    <Link
      to={`/orders/${order.id}`}
      className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[30px] font-extrabold leading-none tracking-tight text-ink-800">{order.id}</p>
          <p className="mt-1 text-sm text-slate-500">
            {order.date} · {order.customer}
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[12px] font-bold uppercase tracking-wide ${status.badgeClassName}`}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Срок</p>
          <p className="mt-1 font-bold text-ink-700">{order.leadTime}</p>
        </div>
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-slate-400">Код / маржа</p>
          <p className="mt-1 font-bold text-ink-700">
            {order.code} · {order.margin}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{order.subtitle}</p>
          <p className="mt-1 text-xs text-slate-400">{order.note}</p>
        </div>
        <div className="text-right">
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

  const filteredOrders = useMemo(() => {
    const orders = ordersStorage.getOrders();
    const normalizedQuery = orderSearchQuery.trim().toLowerCase();
    const normalizedDigitsQuery = normalizedQuery.replace(/\D/g, '');

    return orders.filter((order) => {
      const matchesStatus = activeFilter === 'all' ? true : order.status === activeFilter;
      const normalizedOrderId = order.id.toLowerCase();
      const normalizedOrderDigits = normalizedOrderId.replace(/\D/g, '');
      const normalizedCustomer = order.customer.toLowerCase();
      const matchesOrderByText = normalizedQuery ? normalizedOrderId.includes(normalizedQuery) : true;
      const matchesOrderByDigits = normalizedDigitsQuery
        ? normalizedOrderDigits.includes(normalizedDigitsQuery)
        : false;
      const matchesOrder = matchesOrderByText || matchesOrderByDigits;
      const matchesCustomer = normalizedQuery ? normalizedCustomer.includes(normalizedQuery) : true;
      const matchesSearch = matchesOrder || matchesCustomer;

      return matchesStatus && matchesSearch;
    });
  }, [activeFilter, orderSearchQuery]);

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <section className="relative min-h-[calc(100vh-1.5rem)] flex-1 px-4 pb-36 pt-5">
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-[42px] font-extrabold leading-none tracking-tight text-ink-800">Заказы</h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-brand-50"
                aria-label="Календарь"
              >
                <CalendarDays className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-500 transition-colors hover:bg-brand-50"
                aria-label="Уведомления"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={orderSearchQuery}
              onChange={(event) => setOrderSearchQuery(event.target.value)}
              placeholder="Поиск по номеру или имени клиента..."
              className="h-11 flex-1 border-none bg-transparent text-sm text-ink-700 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Фильтры"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
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
                    'rounded-full whitespace-nowrap border px-5 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-brand-700 bg-brand-50 text-ink-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100',
                  )}
                >
                  {filterOption.label}
                </button>
              );
            })}
          </div>

          {filteredOrders.length > 0 ? (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
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
