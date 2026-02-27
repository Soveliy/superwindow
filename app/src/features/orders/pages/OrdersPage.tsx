import { useMemo, useState } from 'react';
import { Bell, CalendarDays, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { ordersMock, type OrderStatus, type OrderSummary } from '@/features/orders/model/orders.mock';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';

type OrdersFilter = 'all' | OrderStatus;

interface FilterOption {
  id: OrdersFilter;
  label: string;
}

const statusUi: Record<OrderStatus, { label: string; className: string }> = {
  ready: {
    label: 'ГОТОВ',
    className: 'bg-brand-50 text-brand-600',
  },
  in_progress: {
    label: 'В РАБОТЕ',
    className: 'bg-slate-100 text-ink-700',
  },
  paid: {
    label: 'ОПЛАЧЕН',
    className: 'bg-brand-100 text-brand-600',
  },
  new: {
    label: 'НОВЫЙ',
    className: 'bg-slate-100 text-ink-600',
  },
};

const filterOptions: FilterOption[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'ready', label: 'Готовы' },
  { id: 'paid', label: 'Оплачены' },
];

const OrderCard = ({ order }: { order: OrderSummary }) => {
  const status = statusUi[order.status];
  const amount = order.amount === null ? '—' : formatCurrency(order.amount);

  return (
    <Link
      to={`/orders/${order.id}`}
      className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[30px] font-extrabold leading-none tracking-tight text-ink-800">{order.id}</p>
          <p className="mt-1 text-sm text-slate-500">
            {order.date} - {order.customer}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${status.className}`}>{status.label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{order.subtitle}</p>
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
  const [searchByCustomer, setSearchByCustomer] = useState('');
  const [activeFilter, setActiveFilter] = useState<OrdersFilter>('all');

  const filteredOrders = useMemo(() => {
    const normalizedQuery = searchByCustomer.trim().toLowerCase();

    return ordersMock.filter((order) => {
      const matchesStatus = activeFilter === 'all' ? true : order.status === activeFilter;
      const matchesCustomer = normalizedQuery ? order.customer.toLowerCase().includes(normalizedQuery) : true;

      return matchesStatus && matchesCustomer;
    });
  }, [activeFilter, searchByCustomer]);

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel">
        <section className="min-h-[calc(100vh-1.5rem)] relative flex-1 px-4 pb-36 pt-5">
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
              value={searchByCustomer}
              onChange={(event) => setSearchByCustomer(event.target.value)}
              placeholder="Поиск по имени клиента..."
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
                    'rounded-full whitespace-nowrap border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-50 transition-colors hover:bg-slate-100',
                    isActive && 'border-slate-300',
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
            onClick={() => navigate('/orders/new')}
            className="fixed bottom-20 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-50  transition-colors hover:bg-slate-100"
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
