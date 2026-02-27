import { ArrowLeft, CheckCircle2, Clock3, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { orderDetailsMock } from '@/features/orders/model/orders.mock';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

export const PaymentPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel">
        <header className="grid grid-cols-[40px_1fr_40px] items-center border-b border-slate-200 px-4 pb-4 pt-5">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-slate-100"
            onClick={() => navigate('/orders/new')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-center text-lg font-bold text-ink-800">Оплата</h1>
          <span />
        </header>

        <section className="flex-1 space-y-4 px-4 pb-5 pt-4">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Номер заказа</p>
                <p className="text-3xl font-extrabold tracking-tight text-ink-800">#{orderDetailsMock.orderId}</p>
              </div>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600">Ожидает</span>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-ink-800">{orderDetailsMock.customerName}</p>
                <p className="text-xs text-slate-500">{orderDetailsMock.packageTitle}</p>
              </div>
            </div>

            <div className="mb-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Сумма к оплате</p>
              <p className="mt-1 text-[50px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(orderDetailsMock.totalAmount * 10, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <p className="mb-2 text-sm font-bold text-ink-800">Способ оплаты</p>
            <div className="space-y-2">
              <label className="flex items-center justify-between rounded-xl border border-brand-500 bg-brand-50 px-3 py-3">
                <span className='flex flex-col'>
                  <span className="font-semibold text-ink-800">Полная оплата</span>
                  <span className="text-xs text-slate-500">Оплатить всю сумму сразу</span>
                </span>
                <input type="radio" name="payment-mode" defaultChecked />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <span className='flex flex-col'>
                  <span className="font-semibold text-ink-800">Рассрочка</span>
                  <span className="text-xs text-slate-500">3 ежемесячных платежа по 1 616,67 ₽</span>
                </span>
                <input type="radio" name="payment-mode" />
              </label>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink-800">Сканируйте QR-код СБП</h2>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Система быстрых платежей (СБП)</p>
            <div className="mx-auto mt-3 flex h-44 w-44 items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
              <div className="h-24 w-24 rounded-xl border-4 border-slate-300 bg-slate-50" />
            </div>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              ОЖИДАНИЕ ОПЛАТЫ...
            </span>
          </article>

          <Button className="h-14 text-base flex">
            <CheckCircle2 className="h-4 w-4" />
            Подтвердить оплату вручную
          </Button>
        </section>

        <BottomNav />
      </main>
    </div>
  );
};
