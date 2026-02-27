import { useMemo, useState } from 'react';
import { ArrowLeft, CircleHelp, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';

type PackageType = 'budget' | 'standard' | 'premium';
type OpeningType = 'single' | 'double' | 'triple' | 'balcony';

const profileSystems = [
  'Rula 58мм',
  'Isotech 58мм',
  'Grunder 60 мм',
  'Wintech 70мм класс А',
  'Exprof Arctica',
  'Profecta Plus',
] as const;

const openingTypes: Array<{ id: OpeningType; label: string }> = [
  { id: 'single', label: 'Одностворчатое' },
  { id: 'double', label: 'Двухстворчатое' },
  { id: 'triple', label: 'Трехстворчатое' },
  { id: 'balcony', label: 'Балконный блок' },
];

const packageLabels: Array<{ id: PackageType; label: string }> = [
  { id: 'budget', label: 'Бюджет' },
  { id: 'standard', label: 'Стандарт' },
  { id: 'premium', label: 'Премиум' },
];

const accessoryList = [
  { id: 'ext-sill', label: 'Внешний отлив (сталь)', price: 24 },
  { id: 'int-sill', label: 'Внутренний подоконник (ПВХ)', price: 18 },
  { id: 'under-sill', label: 'Подставочный профиль (30 мм)', price: 8.5 },
] as const;

export const CalculatorPage = () => {
  const navigate = useNavigate();

  const [selectedProfile, setSelectedProfile] = useState<(typeof profileSystems)[number]>(profileSystems[0]);
  const [selectedPackage, setSelectedPackage] = useState<PackageType>('standard');
  const [selectedOpeningType, setSelectedOpeningType] = useState<OpeningType>('single');
  const [sealColor, setSealColor] = useState<'black' | 'gray' | 'white'>('black');
  const [drainage, setDrainage] = useState<'front' | 'hidden'>('front');
  const [height, setHeight] = useState('1400');
  const [width, setWidth] = useState('1200');
  const [mosquitoScreenEnabled, setMosquitoScreenEnabled] = useState(true);
  const [selectedAccessories, setSelectedAccessories] = useState<Record<string, boolean>>({
    'ext-sill': false,
    'int-sill': true,
    'under-sill': false,
  });

  const totalPrice = useMemo(() => {
    const basePrice = selectedPackage === 'premium' ? 340 : selectedPackage === 'standard' ? 266.5 : 215;
    const mosquitoPrice = mosquitoScreenEnabled ? 12 : 0;
    const accessoriesPrice = accessoryList.reduce((acc, item) => {
      if (!selectedAccessories[item.id]) {
        return acc;
      }

      return acc + item.price;
    }, 0);

    return basePrice + mosquitoPrice + accessoriesPrice;
  }, [selectedAccessories, selectedPackage, mosquitoScreenEnabled]);

  const toggleAccessory = (id: string): void => {
    setSelectedAccessories((state) => ({
      ...state,
      [id]: !state[id],
    }));
  };

  return (
    <div className="min-h-screen bg-page px-2 py-3">
      <main className="mx-auto w-full max-w-[576px] rounded-[34px] bg-surface shadow-panel pb-12">
        <header className="border-b border-slate-200 px-4 pb-4 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-slate-100"
              onClick={() => navigate('/orders/new')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-lg font-bold text-ink-800">Калькулятор окон</h1>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
            >
              <CircleHelp className="h-4 w-4" />
            </button>
          </div>

        </header>

        <section className="space-y-5 px-4 pb-24 pt-4">
          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">1. Профильная система</h2>
            <div className="grid grid-cols-2 gap-2">
              {profileSystems.map((profile) => {
                const isActive = profile === selectedProfile;
                return (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => setSelectedProfile(profile)}
                    className={`rounded-xl border px-2 py-3 text-left transition-colors ${
                      isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-brand-200'
                    }`}
                  >
                    <span className="mb-2 block h-8 rounded-md bg-slate-100" />
                    <p className="text-xs font-semibold text-ink-700">{profile}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">2. Комплектация</h2>
            <div className="grid grid-cols-3 gap-2">
              {packageLabels.map((item) => {
                const isActive = item.id === selectedPackage;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedPackage(item.id)}
                    className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-brand-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">3. Тип и размеры</h2>
            <div className="grid grid-cols-4 gap-2">
              {openingTypes.map((type) => {
                const isActive = selectedOpeningType === type.id;

                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedOpeningType(type.id)}
                    className={`rounded-xl border px-2 py-2 text-center ${
                      isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <span className="mx-auto mb-1 block h-8 w-8 rounded border border-slate-300" />
                    <span className="text-[11px] font-semibold text-slate-600">{type.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="rounded-xl bg-slate-100 px-3 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ширина</span>
                <input
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                  className="w-full border-none bg-transparent text-xl font-bold text-ink-800 outline-none"
                />
              </label>
              <label className="rounded-xl bg-slate-100 px-3 py-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Высота</span>
                <input
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  className="w-full border-none bg-transparent text-xl font-bold text-ink-800 outline-none"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">4. Технические параметры</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет уплотнителя</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {(['black', 'gray', 'white'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSealColor(color)}
                      className={`h-8 rounded-lg text-xs font-semibold ${
                        sealColor === color ? 'bg-slate-50 text-brand-700 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      {color === 'black' ? 'Черный' : color === 'gray' ? 'Серый' : 'Белый'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Дренаж</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setDrainage('front')}
                    className={`h-8 rounded-lg text-xs font-semibold ${
                      drainage === 'front' ? 'bg-slate-50 text-brand-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Спереди
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrainage('hidden')}
                    className={`h-8 rounded-lg text-xs font-semibold ${
                      drainage === 'hidden' ? 'bg-slate-50 text-brand-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Скрытый
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">5. Настройка створок</h2>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-slate-500">Тип ручки:</span>
                <span className="font-semibold text-ink-700">Стандартная алюминиевая (белая)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-ink-700">Москитная сетка</span>
                <button
                  type="button"
                  onClick={() => setMosquitoScreenEnabled((value) => !value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    mosquitoScreenEnabled ? 'bg-brand-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      mosquitoScreenEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-500">6. Аксессуары</h2>
            <div className="space-y-2">
              {accessoryList.map((item) => (
                <label key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-300"
                      checked={selectedAccessories[item.id]}
                      onChange={() => toggleAccessory(item.id)}
                    />
                    <span className="font-medium text-ink-700">{item.label}</span>
                  </span>
                  <span className="font-semibold text-brand-600">
                    +{formatCurrency(item.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </section>

        <footer className="fixed width-full bottom-0 left-1/2 w-[calc(100%-24px)] max-w-[390px] -translate-x-1/2 rounded-t-2xl border border-slate-200 bg-surface/95 px-4 pb-4 pt-3 shadow-lg backdrop-blur-sm">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Итого</p>
              <p className="text-[38px] font-extrabold leading-none tracking-tight text-ink-800">
                {formatCurrency(totalPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-600">
              <Info className="h-3.5 w-3.5" />
              Скидка применена
            </span>
          </div>
          <Button className="h-12 text-base" onClick={() => navigate('/orders/new')}>
            Добавить в заказ
          </Button>
        </footer>
      </main>
    </div>
  );
};
