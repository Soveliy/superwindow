export type PaymentProvider = 'cash' | 'yandex_pay' | 'sber' | 'sbp';
export type PaymentVariant = 'cash' | 'card' | 'installment' | 'qr';

export interface OrderPaymentSelection {
  provider: PaymentProvider;
  variant: PaymentVariant;
}

export interface OrderPaymentPayload extends OrderPaymentSelection {
  method: string;
  label: string;
  providerLabel: string;
  variantLabel: string;
  payment_provider: PaymentProvider;
  paymentProvider: PaymentProvider;
  payment_variant: PaymentVariant;
  paymentVariant: PaymentVariant;
  payment_method: string;
  paymentMethod: string;
  payment_label: string;
  paymentLabel: string;
  pay_system_code: string;
  paySystemCode: string;
}

export const DEFAULT_ORDER_PAYMENT_SELECTION: OrderPaymentSelection = {
  provider: 'cash',
  variant: 'cash',
};

const providerLabels: Record<PaymentProvider, string> = {
  cash: 'Наличка',
  yandex_pay: 'Яндекс Пей',
  sber: 'Сбер',
  sbp: 'СБП',
};

const variantLabels: Record<PaymentVariant, string> = {
  cash: 'Наличными',
  card: 'Картой',
  installment: 'Частями в рассрочку',
  qr: 'QR-код',
};

const normalizeVariant = (provider: PaymentProvider, variant?: PaymentVariant): PaymentVariant => {
  if (provider === 'cash') {
    return 'cash';
  }

  if (provider === 'sbp') {
    return 'qr';
  }

  return variant === 'installment' ? 'installment' : 'card';
};

export const createOrderPaymentSelection = (
  provider: PaymentProvider,
  variant?: PaymentVariant,
): OrderPaymentSelection => ({
  provider,
  variant: normalizeVariant(provider, variant),
});

export const getOrderPaymentMethod = (selection: OrderPaymentSelection): string => {
  if (selection.provider === 'cash') {
    return 'cash';
  }

  if (selection.provider === 'sbp') {
    return 'sbp';
  }

  return `${selection.provider}_${selection.variant}`;
};

export const getOrderPaymentLabel = (selection: OrderPaymentSelection): string => {
  const providerLabel = providerLabels[selection.provider];
  const variantLabel = variantLabels[selection.variant];

  if (selection.provider === 'cash' || selection.provider === 'sbp') {
    return providerLabel;
  }

  return `${providerLabel}: ${variantLabel}`;
};

export const buildOrderPaymentPayload = (selection: OrderPaymentSelection): OrderPaymentPayload => {
  const normalizedSelection = createOrderPaymentSelection(selection.provider, selection.variant);
  const method = getOrderPaymentMethod(normalizedSelection);
  const label = getOrderPaymentLabel(normalizedSelection);
  const providerLabel = providerLabels[normalizedSelection.provider];
  const variantLabel = variantLabels[normalizedSelection.variant];

  return {
    ...normalizedSelection,
    method,
    label,
    providerLabel,
    variantLabel,
    payment_provider: normalizedSelection.provider,
    paymentProvider: normalizedSelection.provider,
    payment_variant: normalizedSelection.variant,
    paymentVariant: normalizedSelection.variant,
    payment_method: method,
    paymentMethod: method,
    payment_label: label,
    paymentLabel: label,
    pay_system_code: method,
    paySystemCode: method,
  };
};

export const normalizeOrderPaymentSelection = (value: unknown): OrderPaymentSelection => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ORDER_PAYMENT_SELECTION;
  }

  const source = value as Partial<OrderPaymentPayload>;
  const provider = source.provider ?? source.payment_provider ?? source.paymentProvider;
  const variant = source.variant ?? source.payment_variant ?? source.paymentVariant;

  if (provider !== 'cash' && provider !== 'yandex_pay' && provider !== 'sber' && provider !== 'sbp') {
    return DEFAULT_ORDER_PAYMENT_SELECTION;
  }

  return createOrderPaymentSelection(provider, variant);
};

export const paymentProviderLabels = providerLabels;
export const paymentVariantLabels = variantLabels;
