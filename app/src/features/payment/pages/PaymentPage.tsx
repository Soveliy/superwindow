import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock3, UserRound } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { getOrderStatusUi } from '@/features/orders/model/order-status';
import { ordersStorage } from '@/features/orders/model/orders.storage';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Toggle } from '@/shared/ui/Toggle';

type PaymentMode = 'full' | 'installment';

export const PaymentPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const orderId = searchParams.get('orderId')?.trim() ?? '';
  const order = orderId ? ordersStorage.getOrderById(orderId) : undefined;
  const orderForm = orderId ? ordersStorage.getOrderForm(orderId) : null;

  const customerName = orderForm?.fullName.trim() || order?.customer || 'Клиент';
  const packageTitle = order?.subtitle || 'Ожидание расчета';
  const totalAmount = order?.amount ?? 0;
  const installmentAmount = totalAmount > 0 ? totalAmount / 3 : 0;
  const backPath = orderId ? `/orders/${orderId}` : '/orders/new';
  const paymentStatus = getOrderStatusUi(order?.status);

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel pb-16">
        <header className="grid grid-cols-[40px_1fr_40px] items-center border-b border-slate-200 px-4 pb-4 pt-5">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-slate-100"
            onClick={() => navigate(backPath)}
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
                <p className="text-3xl font-extrabold tracking-tight text-ink-800">#{orderId || '—'}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${paymentStatus.badgeClassName}`}>
                {paymentStatus.label}
              </span>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-ink-800">{customerName}</p>
                <p className="text-xs text-slate-500">{packageTitle}</p>
              </div>
            </div>

            <div className="mb-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Сумма к оплате</p>
              <p className="mt-1 text-[50px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(totalAmount, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <p className="mb-2 text-sm font-bold text-ink-800">Способ оплаты</p>
            <div role="radiogroup" aria-label="Payment mode" className="space-y-2">
              <button
                type="button"
                role="radio"
                aria-checked={paymentMode === 'full'}
                onClick={() => setPaymentMode('full')}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                  paymentMode === 'full'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                )}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-ink-800">Полная оплата</span>
                  <span className="text-xs text-slate-500">Оплатить всю сумму сразу</span>
                </span>
                <Toggle checked={paymentMode === 'full'} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={paymentMode === 'installment'}
                onClick={() => setPaymentMode('installment')}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                  paymentMode === 'installment'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                )}
              >
                <span className="flex flex-col">
                  <span className="font-semibold text-ink-800">Рассрочка</span>
                  <span className="text-xs text-slate-500">
                    {`3 ежемесячных платежа по ${formatCurrency(installmentAmount, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                  </span>
                </span>
                <Toggle checked={paymentMode === 'installment'} />
              </button>
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

          <Button className="flex h-14 text-base">
            <CheckCircle2 className="h-4 w-4" />
            Подтвердить оплату вручную
          </Button>
        </section>

        <BottomNav />
      </main>
    </div>
  );
};
