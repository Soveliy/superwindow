import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  QrCode,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BottomNav } from '@/app/layout/BottomNav';
import { markRemoteOrderPaid, updateRemoteOrderPayment } from '@/features/orders/api/order-rest';
import { getOrderStatusUi } from '@/features/orders/model/order-status';
import { ordersStorage } from '@/features/orders/model/orders.storage';
import {
  buildOrderPaymentPayload,
  createOrderPaymentSelection,
  DEFAULT_ORDER_PAYMENT_SELECTION,
  normalizeOrderPaymentSelection,
  paymentVariantLabels,
  type OrderPaymentSelection,
  type PaymentProvider,
  type PaymentVariant,
} from '@/features/payment/model/payment-options';
import { cn } from '@/shared/lib/cn';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

interface PaymentLocationState {
  invoiceNo?: number | string | null;
  invoicePdfUrl?: string | null;
  invoicePdfFileName?: string | null;
  amount?: number | string | null;
  windowDiscount?: number | string | null;
}

type PaymentUpdateState = 'idle' | 'saving' | 'saved' | 'error';
type ManualPaymentState = 'idle' | 'saving' | 'error';

const PAYMENT_SELECTION_STORAGE_KEY = 'superwindow.payment_selection.v1';

const paymentProviderOptions: Array<{
  id: PaymentProvider;
  title: string;
  description: string;
  disabled?: boolean;
  icon: typeof WalletCards;
}> = [
  {
    id: 'cash',
    title: 'Наличка',
    description: 'Оплата наличными',
    icon: WalletCards,
  },
  {
    id: 'yandex_pay',
    title: 'Яндекс Пей',
    description: 'Картой или частями в рассрочку',
    icon: CreditCard,
  },
  {
    id: 'sber',
    title: 'Сбер',
    description: 'Картой или частями в рассрочку',
    icon: Landmark,
  },
  {
    id: 'sbp',
    title: 'СБП',
    description: 'Пока не активно',
    disabled: true,
    icon: QrCode,
  },
];

const providerVariantOptions: PaymentVariant[] = ['card', 'installment'];

const isStorageAvailable = (): boolean => typeof window !== 'undefined' && Boolean(window.localStorage);

const getPaymentStorageKey = (orderId: string): string => `${PAYMENT_SELECTION_STORAGE_KEY}.${orderId || 'draft'}`;

const normalizePaymentAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : null;
  }

  return null;
};

const readStoredPaymentSelection = (orderId: string): OrderPaymentSelection => {
  if (!isStorageAvailable()) {
    return DEFAULT_ORDER_PAYMENT_SELECTION;
  }

  try {
    return normalizeOrderPaymentSelection(JSON.parse(localStorage.getItem(getPaymentStorageKey(orderId)) ?? 'null'));
  } catch {
    return DEFAULT_ORDER_PAYMENT_SELECTION;
  }
};

const writeStoredPaymentSelection = (orderId: string, selection: OrderPaymentSelection): void => {
  if (!isStorageAvailable()) {
    return;
  }

  localStorage.setItem(getPaymentStorageKey(orderId), JSON.stringify(selection));
};

const downloadFileUrl = (url: string, fileName: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const PaymentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const paymentState = location.state as PaymentLocationState | null;
  const orderId = searchParams.get('orderId')?.trim() ?? '';
  const invoiceNo = String(paymentState?.invoiceNo ?? searchParams.get('invoiceNo') ?? '').trim();
  const invoicePdfUrl = paymentState?.invoicePdfUrl?.trim() ?? '';
  const invoicePdfFileName = paymentState?.invoicePdfFileName?.trim() || `invoice-${invoiceNo || orderId}.pdf`;
  const order = orderId ? ordersStorage.getOrderById(orderId) : undefined;
  const orderForm = orderId ? ordersStorage.getOrderForm(orderId) : null;
  const [paymentSelection, setPaymentSelection] = useState<OrderPaymentSelection>(() =>
    readStoredPaymentSelection(orderId),
  );
  const [paymentUpdateState, setPaymentUpdateState] = useState<PaymentUpdateState>('idle');
  const [manualPaymentState, setManualPaymentState] = useState<ManualPaymentState>('idle');
  const [manualPaymentError, setManualPaymentError] = useState<string | null>(null);

  const paymentPayload = useMemo(
    () => buildOrderPaymentPayload(paymentSelection),
    [paymentSelection.provider, paymentSelection.variant],
  );
  const customerName = orderForm?.fullName.trim() || order?.customer || 'Клиент';
  const packageTitle = order?.subtitle || 'Ожидание расчета';
  const totalAmount = normalizePaymentAmount(paymentState?.amount) ?? order?.amount ?? 0;
  const appliedWindowDiscount =
    normalizePaymentAmount(paymentState?.windowDiscount) ??
    (orderId ? ordersStorage.getOrderWindowDiscount(orderId) : 0);
  const installmentAmount = totalAmount > 0 ? totalAmount / 3 : 0;
  const backPath = orderId ? `/orders/${orderId}` : '/orders/new';
  const paymentStatus = getOrderStatusUi(order?.status);
  const hasProviderVariants = paymentSelection.provider === 'yandex_pay' || paymentSelection.provider === 'sber';

  useEffect(() => {
    setPaymentSelection(readStoredPaymentSelection(orderId));
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let isCancelled = false;
    setPaymentUpdateState('saving');

    updateRemoteOrderPayment({ orderId, payment: paymentPayload })
      .then(() => {
        writeStoredPaymentSelection(orderId, paymentSelection);

        if (!isCancelled) {
          setPaymentUpdateState('saved');
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setPaymentUpdateState('error');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [orderId, paymentPayload, paymentSelection]);

  const downloadInvoicePdf = (): void => {
    if (!invoicePdfUrl) {
      return;
    }

    downloadFileUrl(invoicePdfUrl, invoicePdfFileName);
  };

  const selectProvider = (provider: PaymentProvider): void => {
    const option = paymentProviderOptions.find((item) => item.id === provider);

    if (option?.disabled) {
      return;
    }

    setPaymentSelection(createOrderPaymentSelection(provider));
    setManualPaymentState('idle');
    setManualPaymentError(null);
  };

  const selectVariant = (variant: PaymentVariant): void => {
    setPaymentSelection((currentSelection) => createOrderPaymentSelection(currentSelection.provider, variant));
  };

  const confirmManualPayment = async (): Promise<void> => {
    if (!orderId || paymentSelection.provider !== 'cash' || manualPaymentState === 'saving') {
      return;
    }

    setManualPaymentState('saving');
    setManualPaymentError(null);

    try {
      await markRemoteOrderPaid({ orderId, payment: paymentPayload });
      navigate(backPath, { replace: true });
    } catch (error) {
      setManualPaymentState('error');
      setManualPaymentError(error instanceof Error ? error.message : 'Не удалось подтвердить оплату');
    }
  };

  const paymentUpdateLabel =
    paymentUpdateState === 'saving'
      ? 'Сохраняем способ оплаты...'
      : paymentUpdateState === 'saved'
        ? 'Способ оплаты сохранен'
        : paymentUpdateState === 'error'
          ? 'Не удалось сохранить способ оплаты'
          : '';

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
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Номер заказа</p>
                <p className="text-3xl font-extrabold tracking-tight text-ink-800">#{orderId || '-'}</p>
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

            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Сумма к оплате</p>
              <p className="mt-1 text-[50px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(totalAmount, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              {appliedWindowDiscount > 0 ? (
                <p className="mt-3 text-sm font-semibold text-slate-500">
                  Общая скидка учтена: {formatCurrency(appliedWindowDiscount)}
                </p>
              ) : null}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink-800">Способ оплаты</p>
              {paymentUpdateLabel ? (
                <span
                  className={cn(
                    'text-xs font-semibold',
                    paymentUpdateState === 'error' ? 'text-error' : 'text-slate-500',
                  )}
                >
                  {paymentUpdateLabel}
                </span>
              ) : null}
            </div>

            <div role="group" aria-label="Способ оплаты" className="space-y-2">
              {paymentProviderOptions.map((option) => {
                const isSelected = paymentSelection.provider === option.id;
                const Icon = option.icon;

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    disabled={option.disabled}
                    onClick={() => selectProvider(option.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors',
                      isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300',
                      option.disabled && 'cursor-not-allowed opacity-50 hover:border-slate-200',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-surface text-brand-600">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink-800">{option.title}</span>
                        <span className="block text-xs text-slate-500">{option.description}</span>
                      </span>
                    </span>
                    {option.disabled ? (
                      <span className="rounded-full border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-500">
                        Недоступно
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors',
                          isSelected
                            ? 'border-brand-500 bg-brand-500 text-white'
                            : 'border-slate-400 bg-surface text-transparent',
                        )}
                        aria-hidden="true"
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {hasProviderVariants ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {providerVariantOptions.map((variant) => {
                  const isSelected = paymentSelection.variant === variant;

                  return (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => selectVariant(variant)}
                      className={cn(
                        'rounded-xl border px-3 py-3 text-sm font-bold transition-colors',
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-ink-800'
                          : 'border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-300',
                      )}
                    >
                      <span className="block">{paymentVariantLabels[variant]}</span>
                      {variant === 'installment' && installmentAmount > 0 ? (
                        <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                          3 платежа по{' '}
                          {formatCurrency(installmentAmount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </article>

          {invoiceNo ? (
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Коммерческое предложение</p>
                  <p className="mt-1 text-xl font-extrabold text-ink-800">Счет №{invoiceNo}</p>
                </div>
                {invoicePdfUrl ? (
                  <button
                    type="button"
                    onClick={downloadInvoicePdf}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-brand-400 bg-brand-50 px-3 text-sm font-bold text-brand-600 hover:bg-brand-100"
                  >
                    Скачать PDF
                  </button>
                ) : (
                  <span className="text-sm font-semibold text-slate-500">PDF запрошен</span>
                )}
              </div>
            </article>
          ) : null}

          {paymentSelection.provider === 'sbp' ? (
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink-800">Сканируйте QR-код СБП</h2>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Система быстрых платежей</p>
              <div className="mx-auto mt-3 flex h-44 w-44 items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
                <div className="h-24 w-24 rounded-xl border-4 border-slate-300 bg-slate-50" />
              </div>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                Ожидание оплаты...
              </span>
            </article>
          ) : null}

          {paymentSelection.provider === 'cash' ? (
            <div className="space-y-2">
              <Button
                className="flex h-14 text-base"
                disabled={!orderId || paymentUpdateState === 'saving'}
                loading={manualPaymentState === 'saving'}
                onClick={confirmManualPayment}
              >
                <CheckCircle2 className="h-4 w-4" />
                Подтвердить оплату вручную
              </Button>
              {manualPaymentError ? <p className="text-sm font-semibold text-error">{manualPaymentError}</p> : null}
            </div>
          ) : null}
        </section>

        <BottomNav />
      </main>
    </div>
  );
};
