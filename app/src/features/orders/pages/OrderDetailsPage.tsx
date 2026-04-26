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
import { useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  deleteBasketItem,
  getRemoteOrder,
  registerOrGetUser,
  saveRemoteOrder,
  type RemoteOrderSnapshot,
} from '@/features/orders/api/order-rest';
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
import { LOCAL_AJAX_PATHS, postLocalAjaxJson } from '@/shared/api/local-ajax';
import { readAvailableProductionDates } from '@/features/settings/model/production-dates.storage';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { DatePickerField } from '@/shared/ui/DatePickerField';
import { TextField } from '@/shared/ui/TextField';

interface OrderDetailsLocationState {
  resetCalculatorPositions?: boolean;
  calculatorPositions?: CalculatorPosition[];
  draftForm?: OrderCustomerForm;
  draftServices?: OrderService[];
}

const INSTALLATION_RATE_PER_SQUARE = 3500;
const DATE_RANGE_DAYS = 5;
const serviceTypeLabels: Record<OrderService['type'], string> = {
  installation: 'Монтаж (ГОСТ)',
  delivery: 'Доставка',
};
const deliveryModeLabels: Record<DeliveryMode, string> = {
  manual: 'Стоимость вручную',
  pickup: 'Самовывоз',
};

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

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const displayDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const isIsoDate = (value: string): boolean => isoDatePattern.test(value);
const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const addDaysToIsoDate = (isoDate: string, days: number): string => {
  if (!isIsoDate(isoDate)) {
    return '';
  }

  const parsedDate = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  parsedDate.setDate(parsedDate.getDate() + days);
  return toIsoDate(parsedDate);
};

const formatIsoDate = (isoDate: string): string => {
  if (!isIsoDate(isoDate)) {
    return '';
  }

  const parsedDate = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return displayDateFormatter.format(parsedDate);
};

const formatIsoDateRange = (startDate: string): string => {
  const formattedStart = formatIsoDate(startDate);

  if (!formattedStart) {
    return '';
  }

  const endDate = addDaysToIsoDate(startDate, DATE_RANGE_DAYS);
  const formattedEnd = formatIsoDate(endDate);

  return formattedEnd ? `${formattedStart} - ${formattedEnd}` : formattedStart;
};

const buildTemporaryInstallationDates = (daysAhead: number): string[] => {
  const today = new Date();
  const dates: string[] = [];

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + offset);
    dates.push(toIsoDate(nextDate));
  }

  return dates;
};

const normalizeDateByOptions = (value: string, options: string[]): string => {
  if (!value) {
    return '';
  }

  if (options.length === 0 || options.includes(value)) {
    return value;
  }

  const nextAfter = options.find((item) => item >= value);
  return nextAfter ?? options[options.length - 1];
};

const isDraftFormState = (value: unknown): value is OrderCustomerForm => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const form = value as Partial<OrderCustomerForm>;

  return (
    typeof form.fullName === 'string' &&
    typeof form.phone === 'string' &&
    typeof form.address === 'string' &&
    typeof form.contractNumber === 'string' &&
    typeof form.measurementDate === 'string' &&
    typeof form.productionDate === 'string' &&
    typeof form.installationDate === 'string' &&
    typeof form.comment === 'string'
  );
};

const isDraftServiceState = (value: unknown): value is OrderService => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const service = value as Partial<OrderService>;

  if (service.type === 'installation') {
    return typeof service.discount === 'number' && Number.isFinite(service.discount) && service.discount >= 0;
  }

  if (service.type === 'delivery') {
    return (
      (service.mode === 'manual' || service.mode === 'pickup') &&
      typeof service.price === 'number' &&
      Number.isFinite(service.price) &&
      service.price >= 0
    );
  }

  return false;
};

const getLocationDraftForm = (locationState: OrderDetailsLocationState | null): OrderCustomerForm | null => {
  if (!isDraftFormState(locationState?.draftForm)) {
    return null;
  }

  return { ...locationState.draftForm };
};

const getLocationDraftServices = (locationState: OrderDetailsLocationState | null): OrderService[] | null => {
  if (!Array.isArray(locationState?.draftServices)) {
    return null;
  }

  return locationState.draftServices.filter(isDraftServiceState).map((service) =>
    service.type === 'installation'
      ? {
          type: 'installation',
          discount: service.discount,
        }
      : {
          type: 'delivery',
          mode: service.mode,
          price: service.price,
        },
  );
};

const getInitialFormValues = (
  orderId: string | undefined,
  locationState: OrderDetailsLocationState | null,
): OrderCustomerForm => {
  const locationDraftForm = getLocationDraftForm(locationState);

  if (locationDraftForm) {
    return locationDraftForm;
  }

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

const getInitialServices = (
  orderId: string | undefined,
  locationState: OrderDetailsLocationState | null,
): OrderService[] => {
  const locationDraftServices = getLocationDraftServices(locationState);

  if (locationDraftServices) {
    return locationDraftServices;
  }

  if (!orderId) {
    return [];
  }

  return ordersStorage.getOrderServices(orderId) ?? [];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Не удалось выполнить запрос к API.';
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

const buildServiceLabels = (services: OrderService[], totalArea: number) =>
  services.map((service) => {
    if (service.type === 'installation') {
      const basePrice = Math.round(totalArea * INSTALLATION_RATE_PER_SQUARE);
      const finalPrice = Math.max(0, basePrice - service.discount);
      return {
        type: 'installation',
        typeLabel: serviceTypeLabels.installation,
        discount: service.discount,
        discountLabel: formatCurrency(service.discount),
        totalAreaLabel: `${formatArea(totalArea)} м²`,
        basePriceLabel: formatCurrency(basePrice),
        finalPriceLabel: formatCurrency(finalPrice),
      };
    }

    const price = service.mode === 'pickup' ? 0 : service.price;
    return {
      type: 'delivery',
      typeLabel: serviceTypeLabels.delivery,
      deliveryModeLabel: deliveryModeLabels[service.mode],
      price,
      priceLabel: formatCurrency(price),
    };
  });

const buildServiceValues = (services: OrderService[], totalArea: number) =>
  services.map((service) => {
    if (service.type === 'installation') {
      const basePrice = Math.round(totalArea * INSTALLATION_RATE_PER_SQUARE);
      const finalPrice = Math.max(0, basePrice - service.discount);
      return {
        type: 'installation',
        discount: service.discount,
        totalArea,
        basePricePerSquare: INSTALLATION_RATE_PER_SQUARE,
        basePrice,
        finalPrice,
      };
    }

    const price = service.mode === 'pickup' ? 0 : service.price;
    return {
      type: 'delivery',
      deliveryMode: service.mode,
      price,
    };
  });

const buildOrderPositionLabels = (positions: CalculatorPosition[]) =>
  positions.map((position, index) => ({
    positionId: position.id,
    title: `Позиция ${position.id}`,
    index: index + 1,
    dimensionsLabel: `${position.width ?? 0} x ${position.height ?? 0} мм`,
    priceLabel: formatCurrency(position.price ?? 0, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    openingTypeLabel: position.openingType ?? '',
    profileLabel: position.profileId ?? '',
    packageLabel: position.packageType ?? '',
    additionalOptions:
      position.additionalOptions?.map((option) => ({
        id: option.id,
        typeLabel: option.type === 'sill' ? 'Подоконник' : 'Отлив',
        sizeLabel: `${option.length ?? 0} x ${option.width ?? 0} мм`,
        sillColorLabel: option.sillColor ?? '',
      })) ?? [],
  }));

const buildOrderPositionValues = (positions: CalculatorPosition[]) =>
  positions.map((position, index) => ({
    positionId: position.id,
    index: index + 1,
    widthMm: position.width ?? 0,
    heightMm: position.height ?? 0,
    price: position.price ?? 0,
    openingType: position.openingType ?? null,
    profileId: position.profileId ?? null,
    packageType: position.packageType ?? null,
    sealColor: position.sealColor ?? null,
    drainage: position.drainage ?? null,
    windowColorSide: position.windowColorSide ?? null,
    windowColor: position.windowColor ?? null,
    handleType: position.handleType ?? null,
    handleColor: position.handleColor ?? null,
    mullionOrientation: position.mullionOrientation ?? null,
    mullionOffsets: position.mullionOffsets ?? {},
    additionalOptions:
      position.additionalOptions?.map((option) => ({
        id: option.id,
        type: option.type,
        length: option.length ?? 0,
        width: option.width ?? 0,
        sillColor: option.sillColor ?? null,
      })) ?? [],
    rawPosition: position,
  }));

export const OrderDetailsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const locationState = location.state as OrderDetailsLocationState | null;
  const shouldResetCalculatorPositions = locationState?.resetCalculatorPositions === true;

  const [form, setForm] = useState<OrderCustomerForm>(() => getInitialFormValues(orderId, locationState));
  const [positions, setPositions] = useState<CalculatorPosition[]>(() =>
    getInitialPositions(orderId, shouldResetCalculatorPositions, locationState),
  );
  const [services, setServices] = useState<OrderService[]>(() => getInitialServices(orderId, locationState));
  const [remoteOrder, setRemoteOrder] = useState<RemoteOrderSnapshot | null>(null);
  const [remoteOrderError, setRemoteOrderError] = useState<string | null>(null);
  const [isRemoteOrderLoading, setRemoteOrderLoading] = useState(false);
  const [isSubmittingOrder, setSubmittingOrder] = useState(false);
  const [reloadRemoteOrderKey, setReloadRemoteOrderKey] = useState(0);
  const [isCustomerInfoCollapsed, setCustomerInfoCollapsed] = useState(false);
  const [isServiceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceDialogType, setServiceDialogType] = useState<OrderService['type'] | null>(null);
  const [installationDiscountInput, setInstallationDiscountInput] = useState('0');
  const [deliveryModeInput, setDeliveryModeInput] = useState<DeliveryMode>('manual');
  const [deliveryPriceInput, setDeliveryPriceInput] = useState('2000');
  const [availableProductionDates, setAvailableProductionDates] = useState<string[]>(() => readAvailableProductionDates());
  const previousOrderIdRef = useRef<string | undefined>(orderId);
  const storedOrder = orderId ? ordersStorage.getOrderById(orderId) : undefined;
  const currentOrderId = remoteOrder?.orderId ?? orderId ?? null;
  const currentOrderStatusValue = remoteOrder?.status ?? storedOrder?.status;
  const currentOrderAmount = remoteOrder?.amount ?? storedOrder?.amount ?? null;
  const currentOrderCode = remoteOrder?.code ?? storedOrder?.code ?? orderDetailsMock.code;
  const orderStatus = getOrderStatusUi(currentOrderStatusValue);
  const isReadonlyOrder = currentOrderStatusValue === 'ready';
  const isCustomerFieldsReadonly = isReadonlyOrder;
  const resolvedOrderId = currentOrderId ?? 'Новый заказ';
  const calculatorReturnPath = currentOrderId ? `/orders/${currentOrderId}` : '/orders/new';
  const collapsedCustomerName = form.fullName.trim() || 'Новый клиент';
  const collapsedCustomerAddress = form.address.trim() || 'Адрес не указан';
  const collapsedCustomerStatusLabel =
    currentOrderStatusValue === 'ready'
      ? 'Готов'
      : currentOrderStatusValue === 'paid'
        ? 'Оплачен'
        : currentOrderStatusValue === 'in_progress'
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
  const hasEditableBasket = positions.length > 0 || services.length > 0;
  const savedOrderAmount = hasEditableBasket ? calculatedAmount : currentOrderAmount;
  const orderTotalAmount = savedOrderAmount ?? 0;

  const installationService = services.find((service) => service.type === 'installation');
  const deliveryService = services.find((service) => service.type === 'delivery');
  const availableInstallationDates = useMemo(() => buildTemporaryInstallationDates(30), []);
  const productionDateMin = availableProductionDates[0] ?? '';
  const productionDateMax = availableProductionDates[availableProductionDates.length - 1] ?? '';
  const installationDateMin = availableInstallationDates[0] ?? '';
  const installationDateMax = availableInstallationDates[availableInstallationDates.length - 1] ?? '';
  const measurementRangeLabel = form.measurementDate ? formatIsoDateRange(form.measurementDate) : '';
  const installationRangeLabel = form.installationDate ? formatIsoDateRange(form.installationDate) : '';
  const productionDateLabel = form.productionDate ? formatIsoDate(form.productionDate) : '';

  const summaryCode = form.contractNumber.trim() || currentOrderCode;
  const orderPositionLabels = useMemo(() => buildOrderPositionLabels(positions), [positions]);
  const orderPositionValues = useMemo(() => buildOrderPositionValues(positions), [positions]);
  const orderServiceLabels = useMemo(() => buildServiceLabels(services, totalArea), [services, totalArea]);
  const orderServiceValues = useMemo(() => buildServiceValues(services, totalArea), [services, totalArea]);

  useEffect(() => {
    setAvailableProductionDates(readAvailableProductionDates());
    const didOrderChange = previousOrderIdRef.current !== orderId;

    if (!orderId) {
      setRemoteOrder(null);
      setRemoteOrderError(null);
      setRemoteOrderLoading(false);

      if (didOrderChange) {
        setForm(getInitialFormValues(orderId, locationState));
        setServices(getInitialServices(orderId, locationState));
      }

      setPositions(getInitialPositions(orderId, shouldResetCalculatorPositions, locationState));
      previousOrderIdRef.current = orderId;
      return;
    }

    let isCancelled = false;
    const localPositions = getInitialPositions(orderId, shouldResetCalculatorPositions, locationState);
    const localForm = getInitialFormValues(orderId, locationState);
    const localServices = getInitialServices(orderId, locationState);

    setForm(localForm);
    setPositions(localPositions);
    setServices(localServices);
    setRemoteOrderError(null);
    setRemoteOrderLoading(true);
    previousOrderIdRef.current = orderId;

    void (async () => {
      try {
        const snapshot = await getRemoteOrder(orderId);

        if (isCancelled) {
          return;
        }

        const remotePositions = Array.isArray(locationState?.calculatorPositions)
          ? locationState.calculatorPositions.filter(isCalculatorPosition).map(normalizeCalculatorPosition)
          : snapshot.positions;
        const nextForm = getLocationDraftForm(locationState) ?? snapshot.form;
        const nextServices = getLocationDraftServices(locationState) ?? snapshot.services;

        setRemoteOrder(snapshot);
        setForm(nextForm);
        setPositions(remotePositions);
        setServices(nextServices);
        ordersStorage.saveOrder(snapshot.orderId, nextForm, snapshot.amount, remotePositions, nextServices);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setRemoteOrder(null);
        setRemoteOrderError(getErrorMessage(error));
      } finally {
        if (!isCancelled) {
          setRemoteOrderLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [location.key, orderId, shouldResetCalculatorPositions, locationState, reloadRemoteOrderKey]);

  useEffect(() => {
    if (!orderId && shouldResetCalculatorPositions) {
      clearCalculatorPositions();
    }
  }, [orderId, shouldResetCalculatorPositions]);

  useEffect(() => {
    writeCalculatorPositions(positions);
  }, [positions]);

  const buildOrderPayload = (resolvedId: string | null, userId: string, action: 'order_create' | 'order_refresh') => {
    const statusValue = currentOrderStatusValue ?? 'new';
    const statusLabel = getOrderStatusUi(statusValue).label;

    return {
      source: 'order-details',
      action,
      order_id: resolvedId,
      orderId: resolvedId,
      user_id: userId,
      userId,
      user: {
        id: userId,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      },
      order: {
        id: resolvedId,
        code: summaryCode,
        customerName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        userId,
        status: statusValue,
        statusLabel,
        comment: form.comment.trim(),
        amount: orderTotalAmount,
        amountLabel: formatCurrency(orderTotalAmount, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        measurementDate: form.measurementDate || null,
        measurementDateLabel: measurementRangeLabel || '',
        productionDate: form.productionDate || null,
        productionDateLabel,
        installationDate: form.installationDate || null,
        installationDateLabel: installationRangeLabel || '',
      },
      summary: {
        positionsCount: positions.length,
        servicesCount: services.length,
        windowsTotal,
        windowsTotalLabel: formatCurrency(windowsTotal, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        servicesTotal,
        servicesTotalLabel: formatCurrency(servicesTotal, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        totalArea,
        totalAreaLabel: `${formatArea(totalArea)} м²`,
        orderTotal: orderTotalAmount,
        orderTotalLabel: formatCurrency(orderTotalAmount, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      },
      labels: {
        orderStatusLabel: statusLabel,
        positions: orderPositionLabels,
        services: orderServiceLabels,
      },
      values: {
        order_id: resolvedId,
        orderId: resolvedId,
        order_code: summaryCode,
        orderCode: summaryCode,
        customer: {
          user_id: userId,
          userId,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          contractNumber: form.contractNumber.trim(),
          measurementDate: form.measurementDate || null,
          productionDate: form.productionDate || null,
          installationDate: form.installationDate || null,
          comment: form.comment.trim(),
        },
        positions: orderPositionValues,
        services: orderServiceValues,
        totals: {
          windowsTotal,
          servicesTotal,
          totalArea,
          orderTotal: orderTotalAmount,
        },
        rawForm: form,
        rawPositions: positions,
        rawServices: services,
      },
      savedAt: new Date().toISOString(),
    };
  };

  const persistOrder = async (): Promise<string> => {
    if (isReadonlyOrder) {
      if (currentOrderId) {
        return currentOrderId;
      }

      throw new Error('Редактирование сохраненного заказа недоступно.');
    }

    setSubmittingOrder(true);
    setRemoteOrderError(null);

    try {
      const userId = await registerOrGetUser(form);
      const payload = buildOrderPayload(currentOrderId, userId, currentOrderId ? 'order_refresh' : 'order_create');
      const { orderId: savedOrderId } = await saveRemoteOrder({
        orderId: currentOrderId,
        payload,
      });
      const snapshot = await getRemoteOrder(savedOrderId);

      setRemoteOrder(snapshot);
      setForm(snapshot.form);
      setPositions(snapshot.positions);
      setServices(snapshot.services);
      ordersStorage.saveOrder(snapshot.orderId, snapshot.form, snapshot.amount, snapshot.positions, snapshot.services);
      return snapshot.orderId;
    } catch (error) {
      setRemoteOrderError(getErrorMessage(error));
      throw error;
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSaveDraft = async () => {
    if (isReadonlyOrder) {
      return;
    }

    try {
      const savedOrderId = await persistOrder();

      if (!currentOrderId || savedOrderId !== currentOrderId) {
        navigate(`/orders/${savedOrderId}`, { replace: true });
        return;
      }

      setReloadRemoteOrderKey((value) => value + 1);
    } catch {
      return;
    }
  };

  const handleOpenPayment = async () => {
    if (isReadonlyOrder) {
      if (currentOrderId) {
        navigate(`/payment?orderId=${encodeURIComponent(currentOrderId)}`);
      }

      return;
    }

    try {
      const savedOrderId = await persistOrder();
      navigate(`/payment?orderId=${encodeURIComponent(savedOrderId)}`);
    } catch {
      return;
    }
  };

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isReadonlyOrder) {
      return;
    }

    setForm((state) => ({ ...state, phone: formatPhoneInput(event.target.value) }));
  };

  const handleMeasurementDateChange = (nextValue: string) => {
    if (isReadonlyOrder) {
      return;
    }

    setForm((state) => ({ ...state, measurementDate: nextValue }));
  };

  const handleProductionDateChange = (nextValue: string) => {
    if (isReadonlyOrder) {
      return;
    }

    const normalizedValue = normalizeDateByOptions(nextValue, availableProductionDates);
    setForm((state) => ({ ...state, productionDate: normalizedValue }));
  };

  const handleInstallationDateChange = (nextValue: string) => {
    if (isReadonlyOrder) {
      return;
    }

    const normalizedValue = normalizeDateByOptions(nextValue, availableInstallationDates);
    setForm((state) => ({ ...state, installationDate: normalizedValue }));
  };

  const copyPosition = (positionId: number): void => {
    if (isReadonlyOrder) {
      return;
    }

    setPositions((state) => {
      const source = state.find((item) => item.id === positionId);

      if (!source) {
        return state;
      }

      const nextId = Math.max(...state.map((item) => item.id)) + 1;
      return [...state, { ...source, id: nextId }];
    });
  };

  const removePosition = async (positionId: number): Promise<void> => {
    if (isReadonlyOrder) {
      return;
    }

    try {
      setRemoteOrderError(null);
      await deleteBasketItem({
        orderId: currentOrderId,
        orderCode: summaryCode,
        positionId,
      });
      setPositions((state) => state.filter((item) => item.id !== positionId));
    } catch (error) {
      setRemoteOrderError(getErrorMessage(error));
    }
  };

  const handleAddWindow = (): void => {
    if (isReadonlyOrder) {
      return;
    }

    const nextId = positions.length > 0 ? Math.max(...positions.map((item) => item.id)) + 1 : 1;
    writeCalculatorPositions(positions);
    navigate('/calculator', {
      state: {
        positionId: nextId,
        returnTo: calculatorReturnPath,
        draftForm: form,
        draftServices: services,
      },
    });
  };

  const openCalculatorForPosition = (positionId: number): void => {
    if (isReadonlyOrder) {
      return;
    }

    writeCalculatorPositions(positions);
    navigate('/calculator', {
      state: {
        positionId,
        returnTo: calculatorReturnPath,
        draftForm: form,
        draftServices: services,
      },
    });
  };

  const openAddServiceDialog = (): void => {
    if (isReadonlyOrder) {
      return;
    }

    setServiceDialogType(null);
    setServiceDialogOpen(true);
  };

  const openInstallationDialog = (): void => {
    if (isReadonlyOrder) {
      return;
    }

    setInstallationDiscountInput(String(installationService?.discount ?? 0));
    setServiceDialogType('installation');
    setServiceDialogOpen(true);
  };

  const openDeliveryDialog = (): void => {
    if (isReadonlyOrder) {
      return;
    }

    setDeliveryModeInput(deliveryService?.mode ?? 'manual');
    setDeliveryPriceInput(String(deliveryService?.price ?? 2000));
    setServiceDialogType('delivery');
    setServiceDialogOpen(true);
  };

  const closeServiceDialog = (): void => {
    setServiceDialogOpen(false);
    setServiceDialogType(null);
  };

  const saveInstallationService = async (): Promise<void> => {
    if (isReadonlyOrder) {
      return;
    }

    const discount = parseMoneyInput(installationDiscountInput);
    const nextService: OrderService = {
      type: 'installation',
      discount,
    };
    const nextServices = upsertService(services, nextService);
    const nextServicesTotal = nextServices.reduce((total, service) => total + getServicePrice(service, totalArea), 0);
    const nextOrderAmount = windowsTotal + nextServicesTotal;
    const statusValue = currentOrderStatusValue ?? 'new';
    const statusLabel = getOrderStatusUi(statusValue).label;
    const basePrice = Math.round(totalArea * INSTALLATION_RATE_PER_SQUARE);
    const finalPrice = Math.max(0, basePrice - discount);
    const serviceLabels = buildServiceLabels(nextServices, totalArea);
    const serviceValues = buildServiceValues(nextServices, totalArea);
    const labels = {
      serviceTypeLabel: serviceTypeLabels.installation,
      orderStatusLabel: statusLabel,
      positionIdLabel: 'Заказ целиком',
      amountLabel: formatCurrency(nextOrderAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      discountLabel: formatCurrency(discount),
      totalAreaLabel: `${formatArea(totalArea)} м²`,
      basePriceLabel: formatCurrency(basePrice),
      finalPriceLabel: formatCurrency(finalPrice),
      services: serviceLabels,
    };
    const props = {
      serviceTypeLabel: serviceTypeLabels.installation,
      serviceType: 'installation',
      orderId: String(currentOrderId ?? ''),
      orderCode: summaryCode,
      positionId: '',
      positionIdLabel: 'Заказ целиком',
      amount: String(nextOrderAmount),
      amountLabel: formatCurrency(nextOrderAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      discount: String(discount),
      discountLabel: formatCurrency(discount),
      totalArea: String(totalArea),
      totalAreaLabel: `${formatArea(totalArea)} м²`,
      basePrice: String(basePrice),
      basePriceLabel: formatCurrency(basePrice),
      finalPrice: String(finalPrice),
      finalPriceLabel: formatCurrency(finalPrice),
      services: serviceLabels,
    };
    const values = {
      orderId: currentOrderId,
      orderCode: summaryCode,
      customerName: form.fullName.trim(),
      orderStatus: statusValue,
      orderAmount: nextOrderAmount,
      serviceType: 'installation',
      positionId: null,
      discount,
      totalArea,
      basePricePerSquare: INSTALLATION_RATE_PER_SQUARE,
      basePrice,
      finalPrice,
      rawForm: form,
      rawPositions: positions,
      rawServices: nextServices,
      rawService: nextService,
      services: serviceValues,
    };

    try {
      setRemoteOrderError(null);
      await postLocalAjaxJson({
        label: 'service_add',
        path: LOCAL_AJAX_PATHS.addService,
        payload: {
          source: 'order-details',
          action: 'service_add',
          serviceTypeLabel: serviceTypeLabels.installation,
          orderId: currentOrderId,
          positionId: null,
          order: {
            id: currentOrderId,
            code: summaryCode,
            customerName: form.fullName.trim(),
            statusLabel,
            amount: nextOrderAmount,
            amountLabel: formatCurrency(nextOrderAmount, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          },
          pricing: {
            basePricePerSquare: INSTALLATION_RATE_PER_SQUARE,
            totalArea,
            basePrice,
            finalPrice,
            labels: {
              totalArea: `${formatArea(totalArea)} м²`,
              basePrice: formatCurrency(basePrice),
              discount: formatCurrency(discount),
              finalPrice: formatCurrency(finalPrice),
            },
          },
          labels,
          props,
          values,
          savedAt: new Date().toISOString(),
        },
      });

      setServices(nextServices);
      closeServiceDialog();
    } catch (error) {
      setRemoteOrderError(getErrorMessage(error));
    }
  };

  const saveDeliveryService = async (): Promise<void> => {
    if (isReadonlyOrder) {
      return;
    }

    const price = deliveryModeInput === 'pickup' ? 0 : parseMoneyInput(deliveryPriceInput);
    const nextService: OrderService = {
      type: 'delivery',
      mode: deliveryModeInput,
      price,
    };
    const nextServices = upsertService(services, nextService);
    const nextServicesTotal = nextServices.reduce((total, service) => total + getServicePrice(service, totalArea), 0);
    const nextOrderAmount = windowsTotal + nextServicesTotal;
    const statusValue = currentOrderStatusValue ?? 'new';
    const statusLabel = getOrderStatusUi(statusValue).label;
    const serviceLabels = buildServiceLabels(nextServices, totalArea);
    const serviceValues = buildServiceValues(nextServices, totalArea);
    const labels = {
      serviceTypeLabel: serviceTypeLabels.delivery,
      deliveryModeLabel: deliveryModeLabels[deliveryModeInput],
      orderStatusLabel: statusLabel,
      positionIdLabel: 'Заказ целиком',
      amountLabel: formatCurrency(nextOrderAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      priceLabel: formatCurrency(price),
      services: serviceLabels,
    };
    const props = {
      serviceTypeLabel: serviceTypeLabels.delivery,
      serviceType: 'delivery',
      deliveryModeLabel: deliveryModeLabels[deliveryModeInput],
      deliveryMode: deliveryModeInput,
      orderId: String(currentOrderId ?? ''),
      orderCode: summaryCode,
      positionId: '',
      positionIdLabel: 'Заказ целиком',
      amount: String(nextOrderAmount),
      amountLabel: formatCurrency(nextOrderAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      price: String(price),
      priceLabel: formatCurrency(price),
      services: serviceLabels,
    };
    const values = {
      orderId: currentOrderId,
      orderCode: summaryCode,
      customerName: form.fullName.trim(),
      orderStatus: statusValue,
      orderAmount: nextOrderAmount,
      serviceType: 'delivery',
      positionId: null,
      deliveryMode: deliveryModeInput,
      price,
      rawForm: form,
      rawPositions: positions,
      rawServices: nextServices,
      rawService: nextService,
      services: serviceValues,
    };

    try {
      setRemoteOrderError(null);
      await postLocalAjaxJson({
        label: 'service_add',
        path: LOCAL_AJAX_PATHS.addService,
        payload: {
          source: 'order-details',
          action: 'service_add',
          serviceTypeLabel: serviceTypeLabels.delivery,
          orderId: currentOrderId,
          positionId: null,
          order: {
            id: currentOrderId,
            code: summaryCode,
            customerName: form.fullName.trim(),
            statusLabel,
            amount: nextOrderAmount,
            amountLabel: formatCurrency(nextOrderAmount, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          },
          pricing: {
            finalPrice: price,
            labels: {
              deliveryMode: deliveryModeLabels[deliveryModeInput],
              finalPrice: formatCurrency(price),
            },
          },
          labels,
          props,
          values,
          savedAt: new Date().toISOString(),
        },
      });

      setServices(nextServices);
      closeServiceDialog();
    } catch (error) {
      setRemoteOrderError(getErrorMessage(error));
    }
  };

  const removeService = async (serviceType: OrderService['type']): Promise<void> => {
    if (isReadonlyOrder) {
      return;
    }

    try {
      setRemoteOrderError(null);
      await deleteBasketItem({
        orderId: currentOrderId,
        orderCode: summaryCode,
        serviceType,
      });
      setServices((state) => state.filter((service) => service.type !== serviceType));
      closeServiceDialog();
    } catch (error) {
      setRemoteOrderError(getErrorMessage(error));
    }
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
          {isReadonlyOrder ? (
            <span className="justify-self-end text-xs font-semibold uppercase tracking-wide text-slate-400">Просмотр</span>
          ) : (
            <button
              type="button"
              disabled={isSubmittingOrder || isRemoteOrderLoading}
              className="justify-self-end text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleSaveDraft}
            >
              {isSubmittingOrder ? 'Сохраняем...' : 'Сохранить'}
            </button>
          )}
        </header>

        <section className="space-y-6 px-4 pb-6 pt-5">
          {isRemoteOrderLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Загружаем заказ из API...
            </div>
          ) : null}

          {remoteOrderError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {remoteOrderError}
            </div>
          ) : null}

          {isReadonlyOrder ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Заказ в финальном статусе и доступен только для просмотра.
            </div>
          ) : null}

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
                      readOnly={true}
                      value={summaryCode}
                      onChange={(event) => setForm((state) => ({ ...state, contractNumber: event.target.value }))}
                    />
                    <TextField
                      label="Комментарий"
                      placeholder="Заметки..."
                      readOnly={isCustomerFieldsReadonly}
                      value={form.comment}
                      onChange={(event) => setForm((state) => ({ ...state, comment: event.target.value }))}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <DatePickerField
                        label="Дата замера"
                        readOnly={isCustomerFieldsReadonly}
                        value={form.measurementDate}
                        onChange={handleMeasurementDateChange}
                        placeholder="Выберите дату замера"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {measurementRangeLabel ? `Диапазон: ${measurementRangeLabel}` : 'Выберите дату замера'}
                      </p>
                    </article>

                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <DatePickerField
                        label="Дата изготовления"
                        readOnly={isCustomerFieldsReadonly}
                        value={form.productionDate}
                        onChange={handleProductionDateChange}
                        minDate={productionDateMin || undefined}
                        maxDate={productionDateMax || undefined}
                        allowedDates={availableProductionDates}
                        placeholder="Выберите дату изготовления"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {productionDateLabel ? `Выбрано: ${productionDateLabel}` : 'Выберите дату изготовления'}
                      </p>

                    </article>

                    <article className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 col-span-full">
                      <DatePickerField
                        label="Дата монтажа"
                        readOnly={isCustomerFieldsReadonly}
                        value={form.installationDate}
                        onChange={handleInstallationDateChange}
                        minDate={installationDateMin || undefined}
                        maxDate={installationDateMax || undefined}
                        allowedDates={availableInstallationDates}
                        placeholder="Выберите дату монтажа"
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        {installationRangeLabel ? `Диапазон: ${installationRangeLabel}` : 'Выберите дату монтажа'}
                      </p>

                    </article>
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
                        {isReadonlyOrder ? null : (
                          <>
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
                          </>
                        )}
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

            {isReadonlyOrder ? null : (
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
            )}
          </section>
          <section className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm">
            <div className="mb-3">
              <div>
                <div className='flex justify-between items-center mb-3'>
                    <h2 className="text-2xl font-extrabold tracking-tight text-ink-800">
                  Услуги
                  </h2>
                  {isReadonlyOrder ? null : (
                    <button
                      type="button"
                      onClick={openAddServiceDialog}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-600 hover:bg-brand-100"
                    >
                      <Plus className="h-4 w-4" />
                      Добавить услуги
                    </button>
                  )}
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
                      {isReadonlyOrder ? null : (
                        <button
                          type="button"
                          onClick={isInstallation ? openInstallationDialog : openDeliveryDialog}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
                          aria-label="Редактировать услугу"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
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

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Код</p>
                <p className="mt-1 text-sm font-bold text-ink-800">{summaryCode}</p>
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

          <Button
            className="h-14 text-base"
            disabled={isSubmittingOrder || isRemoteOrderLoading}
            onClick={handleOpenPayment}
          >
            {isSubmittingOrder ? 'Сохраняем заказ...' : 'Перейти к оплате >'}
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
