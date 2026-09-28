import { ExternalLink, MapPinned, Navigation } from 'lucide-react';
import type { LeadLocation, WorkOrderRoute } from '@/features/leads/model/leads.types';
import { getLocationLabel, getYandexMapEmbedHref, getYandexMapHref, getYandexRouteHref } from '@/features/leads/model/map-links';

interface MapPreviewProps {
  location: LeadLocation;
  title?: string;
  className?: string;
}

export const MapPreview = ({ location, title = 'Местоположение', className = '' }: MapPreviewProps) => {
  const embedHref = getYandexMapEmbedHref(location);
  const mapHref = getYandexMapHref(location);

  return (
    <div className={className}>
      <div className="relative aspect-[16/9.5] min-h-40 overflow-hidden rounded-sm border border-slate-300 bg-slate-100">
        {location.mapImageUrl ? (
          <img src={location.mapImageUrl} alt={`Карта: ${getLocationLabel(location)}`} className="h-full w-full object-cover" />
        ) : embedHref ? (
          <iframe
            title={`${title}: ${getLocationLabel(location)}`}
            src={embedHref}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center px-5 text-center text-slate-500">
            <MapPinned className="h-8 w-8" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold">Координаты пока не указаны</p>
            <p className="mt-1 text-xs">Откройте адрес на карте для поиска.</p>
          </div>
        )}
      </div>
      <a
        href={mapHref}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:underline"
      >
        Открыть в Яндекс Картах
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
};

interface RoutePreviewProps {
  origin?: LeadLocation;
  destination: LeadLocation;
  route?: WorkOrderRoute;
}

export const RoutePreview = ({ origin, destination, route }: RoutePreviewProps) => {
  const routeHref = getYandexRouteHref(origin, destination);
  const imageLocation = route?.mapImageUrl
    ? { ...destination, mapImageUrl: route.mapImageUrl }
    : destination;

  return (
    <div>
      <MapPreview location={imageLocation} title="Маршрут доставки" />
      {route?.distanceKm !== undefined || route?.durationMinutes !== undefined ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-ink-700">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Маршрут
          </span>
          {route.distanceKm !== undefined ? <span>{route.distanceKm.toLocaleString('ru-RU')} км</span> : null}
          {route.durationMinutes !== undefined ? <span>≈ {route.durationMinutes} мин.</span> : null}
        </div>
      ) : null}
      {routeHref ? (
        <a
          href={routeHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700 hover:underline"
        >
          Построить маршрут
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
};
