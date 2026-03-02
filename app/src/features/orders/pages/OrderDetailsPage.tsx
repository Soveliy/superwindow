import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  ChevronDown,
  Copy,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { orderDetailsMock } from '@/features/orders/model/orders.mock';
import {
  clearCalculatorPositions,
  readCalculatorPositions,
  writeCalculatorPositions,
  type CalculatorPosition,
} from '@/features/calculator/model/positions.storage';
import { ordersStorage, type OrderCustomerForm } from '@/features/orders/model/orders.storage';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { ArrowLeft } from 'lucide-react';

interface OrderDetailsLocationState {
  resetCalculatorPositions?: boolean;
}
const existingOrderDefaultValues: OrderCustomerForm = {
  fullName: 'Александр Петров',
  phone: '+7 (000) 000-00-00',
  address: 'Начните вводить адрес...',
  contractNumber: 'W-2024-001',
  readinessDate: '',
  installationDate: '',
  comment: '',
};

const formatPhoneInput = (rawValue: string) => {
  const digitsOnly = rawValue.replace(/\D/g, '');

  if (!digitsOnly) {
    return '';
  }

  let normalized = digitsOnly;

  if (normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`;
  } else if (!normalized.startsWith('7')) {
    normalized = `7${normalized}`;
  }

  const phoneDigits = normalized.slice(0, 11);
  const areaCode = phoneDigits.slice(1, 4);
  const firstPart = phoneDigits.slice(4, 7);
  const secondPart = phoneDigits.slice(7, 9);
  const thirdPart = phoneDigits.slice(9, 11);

  let masked = '+7';

  if (areaCode) {
    masked += ` (${areaCode}`;
    if (areaCode.length === 3) {
      masked += ')';
    }
  }
  if (firstPart) {
    masked += ` ${firstPart}`;
  }
  if (secondPart) {
    masked += `-${secondPart}`;
  }
  if (thirdPart) {
    masked += `-${thirdPart}`;
  }

  return masked;
};

const formatDateInput = (rawValue: string) => {
  const digitsOnly = rawValue.replace(/\D/g, '').slice(0, 8);

  if (digitsOnly.length <= 2) {
    return digitsOnly;
  }
  if (digitsOnly.length <= 4) {
    return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
  }

  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4)}`;
};

const getInitialFormValues = (orderId: string | undefined): OrderCustomerForm => {
  if (!orderId) {
    return ordersStorage.createEmptyOrderCustomerForm();
  }

  return ordersStorage.getOrderForm(orderId) ?? existingOrderDefaultValues;
};
const getInitialPositions = (
  orderId: string | undefined,
  shouldResetCalculatorPositions: boolean,
): CalculatorPosition[] => {
  if (!orderId) {
    return shouldResetCalculatorPositions ? [] : readCalculatorPositions();
  }

  return ordersStorage.getOrderPositions(orderId) ?? [];
};

export const OrderDetailsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const shouldResetCalculatorPositions =
    (location.state as OrderDetailsLocationState | null)?.resetCalculatorPositions === true;
  const [form, setForm] = useState<OrderCustomerForm>(() => getInitialFormValues(orderId));
  const [positions, setPositions] = useState<CalculatorPosition[]>(() =>
    getInitialPositions(orderId, shouldResetCalculatorPositions),
  );
  const [isCustomerInfoCollapsed, setCustomerInfoCollapsed] = useState(false);

  const order = orderId ? ordersStorage.getOrderById(orderId) : undefined;
  const isCustomerFieldsReadonly = order?.status === 'ready';
  const resolvedOrderId = orderId ?? 'Новый заказ';
  const calculatorReturnPath = orderId ? `/orders/${orderId}` : '/orders/new';
  const collapsedCustomerName = form.fullName.trim() || 'Новый клиент';
  const collapsedCustomerAddress = form.address.trim() || 'Адрес не указан';
  const collapsedCustomerStatusLabel =
    order?.status === 'ready'
      ? 'Готов'
      : order?.status === 'paid'
        ? 'Оплачен'
        : order?.status === 'in_progress'
          ? 'В работе'
          : 'Черновик';

  const positionCards = useMemo(
    () =>
      positions.map((position, index) => ({
        ...position,
        width: position.width ?? 1300 + index * 80,
        height: position.height ?? 1400 + index * 60,
        price: position.price ?? 0,
      })),
    [positions],
  );
  const windowsTotal = useMemo(
    () => positionCards.reduce((total, position) => total + position.price, 0),
    [positionCards],
  );
  const savedOrderAmount = windowsTotal > 0 ? windowsTotal : order?.amount ?? null;
  const orderTotalAmount = savedOrderAmount ?? 0;

  useEffect(() => {
    setForm(getInitialFormValues(orderId));
    setPositions(getInitialPositions(orderId, shouldResetCalculatorPositions));
  }, [orderId, shouldResetCalculatorPositions]);

  useEffect(() => {
    if (!orderId && shouldResetCalculatorPositions) {
      clearCalculatorPositions();
    }
  }, [orderId, shouldResetCalculatorPositions]);

  useEffect(() => {
    writeCalculatorPositions(positions);
  }, [positions]);

  const handleSaveDraft = () => {
    if (orderId) {
      ordersStorage.saveOrder(orderId, form, savedOrderAmount, positions);
      return;
    }

    const createdOrderId = ordersStorage.createOrder(form, savedOrderAmount, positions);
    navigate(`/orders/${createdOrderId}`, { replace: true });
  };
  const handleOpenPayment = () => {
    if (orderId) {
      ordersStorage.saveOrder(orderId, form, savedOrderAmount, positions);
      navigate(`/payment?orderId=${encodeURIComponent(orderId)}`);
      return;
    }

    const createdOrderId = ordersStorage.createOrder(form, savedOrderAmount, positions);
    navigate(`/payment?orderId=${encodeURIComponent(createdOrderId)}`);
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((state) => ({ ...state, phone: formatPhoneInput(event.target.value) }));
  };
  const handleDateChange =
    (field: 'readinessDate' | 'installationDate') => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((state) => ({ ...state, [field]: formatDateInput(event.target.value) }));
    };
  const addPosition = (): void => {
    setPositions((state) => {
      const nextId = state.length > 0 ? Math.max(...state.map((item) => item.id)) + 1 : 1;

      return [...state, { id: nextId }];
    });
  };
  const copyPosition = (positionId: number): void => {
    setPositions((state) => {
      const source = state.find((item) => item.id === positionId);

      if (!source) {
        return state;
      }

      const nextId = Math.max(...state.map((item) => item.id)) + 1;

      return [...state, { ...source, id: nextId }];
    });
  };
  const removePosition = (positionId: number): void => {
    setPositions((state) => state.filter((item) => item.id !== positionId));
  };
  const handleAddWindow = (): void => {
    addPosition();
    navigate('/calculator', { state: { startStep: 2, returnTo: calculatorReturnPath } });
  };
  const openCalculatorStep2 = (): void => {
    navigate('/calculator', { state: { startStep: 2, returnTo: calculatorReturnPath } });
  };

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
            onClick={handleSaveDraft}
          >
            Сохранить черновик
          </button>
        </header>

        <section className="space-y-6 px-4 pb-6 pt-5">
          <section>
            {isCustomerInfoCollapsed ? (
              <button
                type="button"
                onClick={() => setCustomerInfoCollapsed(false)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left shadow-sm hover:bg-slate-100"
                aria-expanded={false}
                aria-label="Развернуть информацию о клиенте"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-brand-500">
                    <UserRound className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[16px] font-extrabold leading-none tracking-tight text-ink-800">
                        {collapsedCustomerName}
                      </span>
                      <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-600">
                        {collapsedCustomerStatusLabel}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-sm text-slate-500">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="truncate">{collapsedCustomerAddress}</span>
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
              </button>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-800">
                    <UserRound className="h-5 w-5 text-brand-500" />
                    Клиент
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCustomerInfoCollapsed(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    aria-expanded
                    aria-label="Свернуть информацию о клиенте"
                  >
                    Свернуть
                    <ChevronDown className="h-4 w-4 rotate-180" />
                  </button>
                </div>
              <div className="space-y-3">
                <TextField
                  label="ФИО"
                  readOnly={isCustomerFieldsReadonly}
                  value={form.fullName}
                  onChange={(event) => setForm((state) => ({ ...state, fullName: event.target.value }))}
                />
                <TextField
                  label="Телефон"
                  type="tel"
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="+7 (___) ___-__-__"
                  readOnly={isCustomerFieldsReadonly}
                  value={form.phone}
                  onChange={handlePhoneChange}
                />
                <TextField
                  label="Адрес доставки"
                  readOnly={isCustomerFieldsReadonly}
                  value={form.address}
                  onChange={(event) => setForm((state) => ({ ...state, address: event.target.value }))}
                  rightSlot={<MapPin className="h-4 w-4 text-slate-400" />}
                />
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Договор №"
                    readOnly={isCustomerFieldsReadonly}
                    value={form.contractNumber}
                    onChange={(event) => setForm((state) => ({ ...state, contractNumber: event.target.value }))}
                  />
                  <TextField
                    label="Дата готовности"
                    placeholder="дд/мм/гггг"
                    inputMode="numeric"
                    maxLength={10}
                    readOnly={isCustomerFieldsReadonly}
                    value={form.readinessDate}
                    onChange={handleDateChange('readinessDate')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Дата монтажа"
                    placeholder="дд/мм/гггг"
                    inputMode="numeric"
                    maxLength={10}
                    readOnly={isCustomerFieldsReadonly}
                    value={form.installationDate}
                    onChange={handleDateChange('installationDate')}
                  />
                  <TextField
                    label="Комментарий"
                    placeholder="Заметки..."
                    readOnly={isCustomerFieldsReadonly}
                    value={form.comment}
                    onChange={(event) => setForm((state) => ({ ...state, comment: event.target.value }))}
                  />
                </div>
              </div>
              </>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink-800">
                <ShoppingCart className="h-5 w-5 text-brand-500" />
                Позиции заказа
              </h2>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-600">
                {positions.length} ПОЗИЦИИ
              </span>
            </div>
            {positionCards.length > 0 ? (
              <div className="space-y-3">
                {positionCards.map((position) => (
                  <article key={position.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="inline-flex h-20 w-20 items-center justify-center rounded-xl border border-slate-300 bg-slate-100">
                        <div className="h-10 w-10 border border-slate-400">
                          <div className="h-full w-1/2 border-r border-slate-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-extrabold text-ink-800">Позиция {position.id}</p>
                        <p className="text-sm text-slate-500">Конфигурация в калькуляторе</p>
                        <p className="mt-2 text-2xl font-extrabold leading-none text-ink-800">
                          {position.width} x {position.height} мм
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between gap-2 border-t border-slate-200 pt-3">
                      <p className="text-[30px] font-extrabold leading-none text-ink-800">
                        {position.price > 0
                          ? formatCurrency(position.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </p>
                      <div className="flex items-center mt-2  gap-2">
                        <button
                          type="button"
                          onClick={() => copyPosition(position.id)}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          <Copy className="h-4 w-4" />
                          Копировать
                        </button>
                        <button
                          type="button"
                          onClick={openCalculatorStep2}
                          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-brand-500 hover:bg-slate-200"
                          aria-label="Редактировать позицию"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePosition(position.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200"
                          aria-label="Удалить позицию"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
                Пока нет добавленных окон
              </div>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={handleAddWindow}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-400 bg-brand-50 text-base font-bold text-brand-600 hover:bg-brand-100"
              >
                <Plus className="h-5 w-5" />
                Добавить еще одно окно
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex flex-col justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Код заказа</p>
                <p className="text-2xl font-extrabold tracking-tight text-ink-800">{orderDetailsMock.code}</p>
                <p className="text-xs text-slate-500">{resolvedOrderId}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Итого</p>
                <p className="text-[36px] font-extrabold leading-none tracking-tight text-ink-800">
                  {formatCurrency(orderTotalAmount, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
          </section>

          <Button className="h-14 text-base" onClick={handleOpenPayment}>
            Перейти к оплате &gt;
          </Button>
        </section>


      </main>
    </div>
  );
};
