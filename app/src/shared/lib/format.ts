interface CurrencyOptions {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  currency?: string;
  locale?: string;
}

export const formatCurrency = (
  value: number,
  { minimumFractionDigits = 0, maximumFractionDigits = 0, currency = 'RUB', locale = 'ru-RU' }: CurrencyOptions = {},
): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
