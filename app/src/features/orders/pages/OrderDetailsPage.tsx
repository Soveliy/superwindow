import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  MapPin,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  clearCalculatorPositions,
  isCalculatorPosition,
  normalizeCalculatorPosition,
  readCalculatorPositions,
  writeCalculatorPositions,
  type CalculatorPosition,
} from '@/features/calculator/model/positions.storage';
import { getOrderStatusUi } from '@/features/orders/model/order-status';
import { type DeliveryMode, orderDetailsMock, type OrderService } from '@/features/orders/model/orders.mock';
import { ordersStorage, type OrderCustomerForm } from '@/features/orders/model/orders.storage';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

interface OrderDetailsLocationState {
  resetCalculatorPositions?: boolean;
  calculatorPositions?: CalculatorPosition[];
}

const INSTALLATION_RATE_PER_SQUARE = 3500;

const existingOrderDefaultValues: OrderCustomerForm = {
  fullName: 'Александр Петров',
  phone: '+7 (000) 000-00-00',
  address: 'Начните вводить адрес...',
  contractNumber: 'SW-2024-001',
  measurementDate: '',
  productionDate: '',
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
  locationState: OrderDetailsLocationState | null,
): CalculatorPosition[] => {
  if (Array.isArray(locationState?.calculatorPositions)) {
    return locationState.calculatorPositions.filter(isCalculatorPosition).map(normalizeCalculatorPosition);
  }

  if (!orderId) {
    return shouldResetCalculatorPositions ? [] : readCalculatorPositions();
  }

  return ordersStorage.getOrderPositions(orderId) ?? [];
};

const getInitialServices = (orderId: string | undefined): OrderService[] => {
  if (!orderId) {
    return [];
  }

  return ordersStorage.getOrderServices(orderId) ?? [];
};

const parseMoneyInput = (value: string): number => {
  const digits = value.replace(/[^\d]/g, '');

  if (!digits) {
    return 0;
  }

  return Math.max(0, Number.parseInt(digits, 10));
};

const upsertService = (services: OrderService[], nextService: OrderService): OrderService[] => [
  ...services.filter((service) => service.type !== nextService.type),
  nextService,
];

const getServicePrice = (service: OrderService, totalArea: number): number => {
  if (service.type === 'installation') {
    const basePrice = Math.round(totalArea * INSTALLATION_RATE_PER_SQUARE);
    return Math.max(0, basePrice - service.discount);
  }

  return service.mode === 'pickup' ? 0 : service.price;
};

const formatArea = (value: number): string =>
  new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const OrderDetailsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const locationState = location.state as OrderDetailsLocationState | null;
  const shouldResetCalculatorPositions = locationState?.resetCalculatorPositions === true;

  const [form, setForm] = useState<OrderCustomerForm>(() => getInitialFormValues(orderId));
  const [positions, setPositions] = useState<CalculatorPosition[]>(() =>
    getInitialPositions(orderId, shouldResetCalculatorPositions, locationState),
  );
  const [services, setServices] = useState<OrderService[]>(() => getInitialServices(orderId));
  const [isCustomerInfoCollapsed, setCustomerInfoCollapsed] = useState(false);
  const [isServiceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceDialogType, setServiceDialogType] = useState<OrderService['type'] | null>(null);
  const [installationDiscountInput, setInstallationDiscountInput] = useState('0');
  const [deliveryModeInput, setDeliveryModeInput] = useState<DeliveryMode>('manual');
  const [deliveryPriceInput, setDeliveryPriceInput] = useState('2000');
  const order = orderId ? ordersStorage.getOrderById(orderId) : undefined;
  const orderStatus = getOrderStatusUi(order?.status);
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
      positions.map((position) => ({
        ...position,
        width: position.width ?? 1300,
        height: position.height ?? 1400,
        price: position.price ?? 0,
      })),
    [positions],
  );

  const totalArea = useMemo(
    () =>
      positionCards.reduce((total, position) => total + (position.width * position.height) / 1_000_000, 0),
    [positionCards],
  );

  const windowsTotal = useMemo(
    () => positionCards.reduce((total, position) => total + position.price, 0),
    [positionCards],
  );

  const servicesTotal = useMemo(
    () => services.reduce((total, service) => total + getServicePrice(service, totalArea), 0),
    [services, totalArea],
  );

  const calculatedAmount = windowsTotal + servicesTotal;
  const savedOrderAmount = calculatedAmount > 0 ? calculatedAmount : order?.amount ?? null;
  const orderTotalAmount = savedOrderAmount ?? 0;

  const installationService = services.find((service) => service.type === 'installation');
  const deliveryService = services.find((service) => service.type === 'delivery');

  const summaryLeadTime = form.productionDate.trim()
    ? form.productionDate.trim()
    : order?.leadTime ?? orderDetailsMock.leadTime;
  const summaryCode = form.contractNumber.trim() || order?.code || orderDetailsMock.code;
  const summaryMargin = savedOrderAmount ? order?.margin ?? orderDetailsMock.margin : '—';

  useEffect(() => {
    setForm(getInitialFormValues(orderId));
    setPositions(getInitialPositions(orderId, shouldResetCalculatorPositions, locationState));
    setServices(getInitialServices(orderId));
  }, [location.key, locationState, orderId, shouldResetCalculatorPositions]);

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
      ordersStorage.saveOrder(orderId, form, savedOrderAmount, positions, services);
      return;
    }

    const createdOrderId = ordersStorage.createOrder(form, savedOrderAmount, positions, services);
    navigate(`/orders/${createdOrderId}`, { replace: true });
  };

  const handleOpenPayment = () => {
    if (orderId) {
      ordersStorage.saveOrder(orderId, form, savedOrderAmount, positions, services);
      navigate(`/payment?orderId=${encodeURIComponent(orderId)}`);
      return;
    }

    const createdOrderId = ordersStorage.createOrder(form, savedOrderAmount, positions, services);
    navigate(`/payment?orderId=${encodeURIComponent(createdOrderId)}`);
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((state) => ({ ...state, phone: formatPhoneInput(event.target.value) }));
  };

  const handleDateChange =
    (field: 'productionDate' | 'installationDate') => (event: ChangeEvent<HTMLInputElement>) => {
      setForm((state) => ({ ...state, [field]: formatDateInput(event.target.value) }));
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
    const nextId = positions.length > 0 ? Math.max(...positions.map((item) => item.id)) + 1 : 1;
    writeCalculatorPositions(positions);
    navigate('/calculator', { state: { positionId: nextId, returnTo: calculatorReturnPath } });
  };

  const openCalculatorForPosition = (positionId: number): void => {
    writeCalculatorPositions(positions);
    navigate('/calculator', { state: { positionId, returnTo: calculatorReturnPath } });
  };

  const openAddServiceDialog = (): void => {
    setServiceDialogType(null);
    setServiceDialogOpen(true);
  };

  const openInstallationDialog = (): void => {
    setInstallationDiscountInput(String(installationService?.discount ?? 0));
    setServiceDialogType('installation');
    setServiceDialogOpen(true);
  };

  const openDeliveryDialog = (): void => {
    setDeliveryModeInput(deliveryService?.mode ?? 'manual');
    setDeliveryPriceInput(String(deliveryService?.price ?? 2000));
    setServiceDialogType('delivery');
    setServiceDialogOpen(true);
  };

  const closeServiceDialog = (): void => {
    setServiceDialogOpen(false);
    setServiceDialogType(null);
  };

  const saveInstallationService = (): void => {
    setServices((state) =>
      upsertService(state, {
        type: 'installation',
        discount: parseMoneyInput(installationDiscountInput),
      }),
    );
    closeServiceDialog();
  };

  const saveDeliveryService = (): void => {
    setServices((state) =>
      upsertService(state, {
        type: 'delivery',
        mode: deliveryModeInput,
        price: deliveryModeInput === 'pickup' ? 0 : parseMoneyInput(deliveryPriceInput),
      }),
    );
    closeServiceDialog();
  };

  const removeService = (serviceType: OrderService['type']): void => {
    setServices((state) => state.filter((service) => service.type !== serviceType));
    closeServiceDialog();
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-xl bg-surface shadow-panel">
        <header className="grid grid-cols-[64px_1fr_80px] items-center border-b border-slate-200 px-4 py-4 rounded-0">
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
            Сохранить
          </button>
        </header>

        <section className="space-y-6 px-4 pb-6 pt-5">
          <section>
            {isCustomerInfoCollapsed ? (
              <button
                type="button"
                onClick={() => setCustomerInfoCollapsed(false)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left shadow-sm hover:bg-slate-100"
                aria-expanded={false}
                aria-label="Развернуть информацию о клиенте"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-brand-500">
                    <UserRound className="h-6 w-6 text-ink-800" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[16px] font-extrabold leading-none tracking-tight text-ink-800">
                        {collapsedCustomerName}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${orderStatus.badgeClassName}`}
                      >
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
                    <UserRound className="h-5 w-5 text-ink-800" />
                    Клиент
                  </h2>
                  <button
                    type="button"
                    onClick={() => setCustomerInfoCollapsed(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-black"
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
                      label="Код заказа"
                      readOnly={isCustomerFieldsReadonly}
                      value={form.contractNumber}
                      onChange={(event) => setForm((state) => ({ ...state, contractNumber: event.target.value }))}
                    />
                    <TextField
                      label="Дата изготовления"
                      placeholder="дд/мм/гггг"
                      inputMode="numeric"
                      maxLength={10}
                      readOnly={isCustomerFieldsReadonly}
                      value={form.productionDate}
                      onChange={handleDateChange('productionDate')}
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
                <ShoppingCart className="h-5 w-5 text-ink-800" />
                Позиции заказа
              </h2>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-bold text-brand-600">
                {positions.length} ПОЗИЦИИ
              </span>
            </div>

            {positionCards.length > 0 ? (
              <div className="space-y-3">
                {positionCards.map((position) => (
                  <article key={position.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <div className="mb-3 flex items-start gap-3">
                      <div className="inline-flex shrink-0 h-20 w-20 items-center justify-center rounded-xl border border-slate-300 bg-slate-100">
                        <div className="h-10 w-10 border border-slate-400">
                          <div className="h-full w-1/2 border-r border-slate-400" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-extrabold text-ink-800">Позиция {position.id}</p>
                        <p className="text-sm text-slate-500">Конфигурация сохранена в калькуляторе</p>
                        <p className="mt-2 text-2xl font-extrabold leading-none text-ink-800">
                          {position.width} x {position.height} мм
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
                      <p className="text-[30px] font-extrabold leading-none text-ink-800">
                        {position.price > 0
                          ? formatCurrency(position.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
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
                          onClick={() => openCalculatorForPosition(position.id)}
                          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
                          aria-label="Редактировать позицию"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePosition(position.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
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
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-slate-500">
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
          <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
            <div className="mb-3">
              <div>
                <div className='flex justify-between items-center mb-3'>
                    <h2 className="text-2xl font-extrabold tracking-tight text-ink-800">
                  Услуги
                  </h2>
                  <button
                type="button"
                onClick={openAddServiceDialog}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-600 hover:bg-brand-100"
              >
                <Plus className="h-4 w-4" />
                Добавить услуги
              </button>
                </div>
                <p className="text-sm text-slate-500">Монтаж по ГОСТу и доставка</p>
              </div>

            </div>

            {services.length > 0 ? (
              <div className="space-y-3">
                {services.map((service) => {
                  const isInstallation = service.type === 'installation';
                  const price = getServicePrice(service, totalArea);
                  const title = isInstallation ? 'Монтаж (ГОСТ)' : 'Доставка';
                  const subtitle = isInstallation
                    ? service.discount > 0
                      ? `${positionCards.length} ед. изделий · скидка ${formatCurrency(service.discount)}`
                      : `${positionCards.length} ед. изделий · ${formatArea(totalArea)} м²`
                    : service.mode === 'pickup'
                      ? 'Самовывоз'
                      : 'Стоимость указана вручную';
                  const Icon = isInstallation ? Wrench : Truck;

                  return (
                    <article
                      key={service.type}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 shadow-sm"
                    >
                      <span
                        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${
                          isInstallation ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink-800">{title}</p>
                        <p className="text-sm text-slate-500">{subtitle}</p>
                      </div>
                      <p className="text-xl font-extrabold text-ink-800">{formatCurrency(price)}</p>
                      <button
                        type="button"
                        onClick={isInstallation ? openInstallationDialog : openDeliveryDialog}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        aria-label="Редактировать услугу"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-slate-500">
                Пока услуги не добавлены
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Срок</p>
                <p className="mt-1 text-sm font-bold text-ink-800">{summaryLeadTime}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Код</p>
                <p className="mt-1 text-sm font-bold text-ink-800">{summaryCode}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Маржа</p>
                <p className="mt-1 text-sm font-bold text-ink-800">{summaryMargin}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 border-t border-slate-200 pt-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Заказ</p>
                <p className="text-2xl font-extrabold tracking-tight text-ink-800">{resolvedOrderId}</p>
              </div>
              <div>
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

      {isServiceDialogOpen ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
          <div className="w-full max-w-[540px] rounded-xl bg-surface p-4 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-ink-800">Услуги</h3>
                <p className="text-sm text-slate-500">
                  {serviceDialogType === null ? 'Выберите тип услуги' : 'Настройте параметры'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeServiceDialog}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {serviceDialogType === null ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={openInstallationDialog}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <Wrench className="mb-3 h-5 w-5 text-orange-500" />
                  <p className="font-bold text-ink-800">Монтаж по ГОСТу</p>
                  <p className="mt-1 text-sm text-slate-500">{formatCurrency(INSTALLATION_RATE_PER_SQUARE)}/м²</p>
                </button>
                <button
                  type="button"
                  onClick={openDeliveryDialog}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <Truck className="mb-3 h-5 w-5 text-blue-500" />
                  <p className="font-bold text-ink-800">Доставка</p>
                  <p className="mt-1 text-sm text-slate-500">Стоимость вручную или самовывоз</p>
                </button>
              </div>
            ) : null}

            {serviceDialogType === 'installation' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Площадь изделий</span>
                    <span className="font-bold text-ink-800">{formatArea(totalArea)} м²</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Ставка</span>
                    <span className="font-bold text-ink-800">{formatCurrency(INSTALLATION_RATE_PER_SQUARE)}/м²</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Базовая стоимость</span>
                    <span className="font-bold text-ink-800">
                      {formatCurrency(Math.round(totalArea * INSTALLATION_RATE_PER_SQUARE))}
                    </span>
                  </div>
                </div>

                <TextField
                  label="Скидка, ₽"
                  inputMode="numeric"
                  value={installationDiscountInput}
                  onChange={(event) => setInstallationDiscountInput(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                />

                <div className="flex gap-3">
                  {installationService ? (
                    <button
                      type="button"
                      onClick={() => removeService('installation')}
                      className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Удалить
                    </button>
                  ) : null}
                  <Button className="h-12 flex-1 text-base" onClick={saveInstallationService}>
                    Сохранить услугу
                  </Button>
                </div>
              </div>
            ) : null}

            {serviceDialogType === 'delivery' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryModeInput('manual')}
                    className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                      deliveryModeInput === 'manual'
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Стоимость вручную
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryModeInput('pickup')}
                    className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                      deliveryModeInput === 'pickup'
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Самовывоз
                  </button>
                </div>

                {deliveryModeInput === 'manual' ? (
                  <TextField
                    label="Стоимость доставки, ₽"
                    inputMode="numeric"
                    value={deliveryPriceInput}
                    onChange={(event) => setDeliveryPriceInput(event.target.value.replace(/[^\d]/g, ''))}
                    placeholder="2000"
                  />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Для самовывоза стоимость услуги будет равна 0 ₽.
                  </div>
                )}

                <div className="flex gap-3">
                  {deliveryService ? (
                    <button
                      type="button"
                      onClick={() => removeService('delivery')}
                      className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Удалить
                    </button>
                  ) : null}
                  <Button className="h-12 flex-1 text-base" onClick={saveDeliveryService}>
                    Сохранить услугу
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
