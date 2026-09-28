import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { LeadServiceType } from '@/features/leads/model/leads.types';

export type BudgetFilter = 'all' | 'under-150' | '150-300' | 'over-300';

export interface LeadFilterValue {
  search: string;
  region: string;
  serviceType: '' | LeadServiceType;
  product: string;
  budget: BudgetFilter;
}

interface LeadFiltersProps {
  value: LeadFilterValue;
  regions: string[];
  products: string[];
  onChange: (value: LeadFilterValue) => void;
  resultCount?: number;
}

const selectClassName =
  'h-9 w-full min-w-0 rounded-xl border border-slate-300 bg-surface px-2 text-xs font-semibold text-slate-600 outline-none transition-colors hover:border-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export const LeadFilters = ({ value, regions, products, onChange, resultCount }: LeadFiltersProps) => {
  const hasFilters = Boolean(value.search || value.region || value.serviceType || value.product || value.budget !== 'all');

  return (
    <section aria-label="Поиск и фильтры лидов">
      <div className="grid grid-cols-3 gap-2" aria-label="Фильтры">
        <select aria-label="Регион" value={value.region} onChange={(event) => onChange({ ...value, region: event.target.value })} className={selectClassName}>
          <option value="">Регион</option>
          {regions.map((region) => <option key={region} value={region}>{region}</option>)}
        </select>
        <select aria-label="Бюджет" value={value.budget} onChange={(event) => onChange({ ...value, budget: event.target.value as BudgetFilter })} className={selectClassName}>
          <option value="all">Бюджет</option>
          <option value="under-150">до 150 000 ₽</option>
          <option value="150-300">150–300 тыс. ₽</option>
          <option value="over-300">от 300 000 ₽</option>
        </select>
        <select aria-label="Тип услуги" value={value.serviceType} onChange={(event) => onChange({ ...value, serviceType: event.target.value as LeadFilterValue['serviceType'] })} className={selectClassName}>
          <option value="">Тип заказа</option>
          <option value="measurement">Замер</option>
          <option value="installation">Монтаж</option>
          <option value="delivery">Доставка</option>
        </select>
      </div>

      <details className="mt-2 rounded-lg border border-transparent open:border-slate-200 open:bg-surface open:p-3">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Поиск и продукция
          {value.search || value.product ? <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Есть активные фильтры" /> : null}
          <span className="ml-auto font-normal text-slate-500">{resultCount === undefined ? null : `Найдено: ${resultCount}`}</span>
        </summary>
        <label className="relative mt-2 block">
          <span className="sr-only">Поиск лидов</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={value.search} onChange={(event) => onChange({ ...value, search: event.target.value })} placeholder="Название, город или продукт" className="h-11 w-full rounded-lg border border-slate-300 bg-slate-50 pl-10 pr-10 text-sm text-ink-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          {value.search ? (
            <button type="button" onClick={() => onChange({ ...value, search: '' })} className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200" aria-label="Очистить поиск">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <select aria-label="Тип продукции" value={value.product} onChange={(event) => onChange({ ...value, product: event.target.value })} className={`${selectClassName} mt-2`}>
          <option value="">Вся продукция</option>
          {products.map((product) => <option key={product} value={product}>{product}</option>)}
        </select>
      </details>

      {hasFilters ? (
        <button type="button" onClick={() => onChange({ search: '', region: '', serviceType: '', product: '', budget: 'all' })} className="mt-1 min-h-8 text-xs font-semibold text-ink-700 hover:underline">
          Сбросить фильтры
        </button>
      ) : null}
    </section>
  );
};
