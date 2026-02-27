import { useState } from 'react';
import {
  EllipsisVertical,
  MapPin,
  Pencil,
  PlusCircle,
  ShoppingCart,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { orderDetailsMock, orderItemsMock } from '@/features/orders/model/orders.mock';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { ArrowLeft } from 'lucide-react';
interface CustomerFormState {
  fullName: string;
  phone: string;
  address: string;
  contractNumber: string;
  readinessDate: string;
  installationDate: string;
  comment: string;
}

const defaultFormValues: CustomerFormState = {
  fullName: 'Александр Петров',
  phone: '+7 (000) 000-00-00',
  address: 'Начните вводить адрес...',
  contractNumber: 'W-2024-001',
  readinessDate: '',
  installationDate: '',
  comment: '',
};

export const OrderDetailsPage = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [form, setForm] = useState<CustomerFormState>(defaultFormValues);

  const resolvedOrderId = orderId ?? orderDetailsMock.orderId;

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel">
        <header className="grid grid-cols-[64px_1fr_80px] items-center border-b border-slate-200 px-4 py-4">
          <button
            type="button"
            className="justify-self-start text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
            onClick={() => navigate('/orders')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-center text-lg font-bold text-ink-800">Детали заказа</h1>
          <button
            type="button"
            className="justify-self-end text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            Сохранить черновик
          </button>
        </header>

        <section className="space-y-6 px-4 pb-6 pt-5">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-800">
              <UserRound className="h-5 w-5 text-brand-500" />
              Информация о клиенте
            </h2>
            <div className="space-y-3">
              <TextField
                label="ФИО"
                value={form.fullName}
                onChange={(event) => setForm((state) => ({ ...state, fullName: event.target.value }))}
              />
              <TextField
                label="Телефон"
                value={form.phone}
                onChange={(event) => setForm((state) => ({ ...state, phone: event.target.value }))}
              />
              <TextField
                label="Адрес доставки"
                value={form.address}
                onChange={(event) => setForm((state) => ({ ...state, address: event.target.value }))}
                rightSlot={<MapPin className="h-4 w-4 text-slate-400" />}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Договор №"
                  value={form.contractNumber}
                  onChange={(event) => setForm((state) => ({ ...state, contractNumber: event.target.value }))}
                />
                <TextField
                  label="Дата готовности"
                  placeholder="дд/мм/гггг"
                  value={form.readinessDate}
                  onChange={(event) => setForm((state) => ({ ...state, readinessDate: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Дата монтажа"
                  placeholder="дд/мм/гггг"
                  value={form.installationDate}
                  onChange={(event) => setForm((state) => ({ ...state, installationDate: event.target.value }))}
                />
                <TextField
                  label="Комментарий"
                  placeholder="Заметки..."
                  value={form.comment}
                  onChange={(event) => setForm((state) => ({ ...state, comment: event.target.value }))}
                />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-800">
                <ShoppingCart className="h-5 w-5 text-brand-500" />
                Позиции заказа
              </h2>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-600">
                {orderItemsMock.length} ПОЗИЦИИ
              </span>
            </div>
            <div className="space-y-3">
              {orderItemsMock.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-3">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <PlusCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-ink-800">{item.title}</p>
                        <p className="max-w-[190px] text-xs text-slate-500">{item.details}</p>
                        <p className="mt-1 text-2xl font-extrabold tracking-tight text-brand-600">
                          {formatCurrency(item.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Редактировать позицию"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-error/10 hover:text-error"
                      aria-label="Удалить позицию"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => navigate('/calculator')}>
                Добавить изделие
              </Button>
              <Button variant="ghost" className="border border-slate-200">
                + Аксессуар
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Код заказа</p>
                <p className="text-2xl font-extrabold tracking-tight text-ink-800">{orderDetailsMock.code}</p>
                <p className="text-xs text-slate-500">{resolvedOrderId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Итого</p>
                <p className="text-[36px] font-extrabold leading-none tracking-tight text-ink-800">
                  {formatCurrency(orderDetailsMock.totalAmount, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </section>

          <Button className="h-14 text-base" onClick={() => navigate('/payment')}>
            Перейти к оплате &gt;
          </Button>
        </section>

        <footer className="px-4 pb-4">
          <div className="mx-auto h-1.5 w-28 rounded-full bg-slate-200" />
        </footer>
      </main>
    </div>
  );
};
