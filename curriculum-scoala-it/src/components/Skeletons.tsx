/**
 * Skeleton-uri de incarcare (folosite de loading.tsx din fiecare ruta) - au FORMA paginii care
 * urmeaza, ca la apasarea unui buton din meniu sa apara instant ceva familiar (sub ~100ms, chiar
 * si pe 3G), in loc de un spinner pe ecran gol. Server components pure, fara JS pe client.
 * Antetul si bara de jos raman cele din Shell (layout-ul nu se re-randeaza la navigare).
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Pagina generica: titlu + cateva carduri - pentru rutele fara skeleton dedicat. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-busy="true" aria-label="Se încarcă">
      <div className="space-y-2">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-56 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-20 w-full" />)}
      </div>
    </div>
  );
}

/** Curriculum: antet + platforme pliate (acordeoane). */
export function CurriculumSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-7" aria-busy="true" aria-label="Se încarcă">
      <div className="space-y-2">
        <Bar className="h-3 w-28" />
        <Bar className="h-9 w-48" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-[76px] w-full rounded-2xl" />)}
      </div>
    </div>
  );
}

/** Lectie: titlu, obiectiv, video 16:9, doua carduri. */
export function LessonSkeleton() {
  return (
    <div className="mx-auto max-w-4xl" aria-busy="true" aria-label="Se încarcă">
      <Bar className="h-4 w-24" />
      <div className="mt-4 space-y-2">
        <Bar className="h-3 w-20" />
        <Bar className="h-9 w-72 max-w-full" />
      </div>
      <div className="mt-7 space-y-6">
        <Bar className="h-24 w-full rounded-2xl" />
        <Bar className="aspect-video w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Bar className="h-28 rounded-2xl" />
          <Bar className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Lista simpla de randuri (modul, abonamente). */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6" aria-busy="true" aria-label="Se încarcă">
      <div className="space-y-2">
        <Bar className="h-3 w-16" />
        <Bar className="h-8 w-60 max-w-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => <Bar key={i} className="h-12 w-full" />)}
      </div>
    </div>
  );
}

/**
 * Paginile "tracker" (Progress, Registru, Diplome) au fundal negru pe toata latimea si un antet
 * propriu lipit sus - skeleton-ul reproduce exact aceleasi margini negative ca pagina reala, ca
 * la inlocuire sa nu sara nimic (fara CLS).
 */
export function TrackerSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div
      className="tracker-root -mx-4 -mt-4 -mb-[calc(6.5rem+env(safe-area-inset-bottom))] min-h-screen bg-black pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-white lg:-mx-10 lg:-my-9 lg:pb-0"
      aria-busy="true" aria-label="Se încarcă"
    >
      <div className="border-b border-white/10 px-4 py-3 lg:py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 lg:justify-between">
          <Bar className="hidden h-7 w-56 lg:block" />
          <div className="flex gap-2">
            <Bar className="h-10 w-12 rounded-xl" />
            <Bar className="h-10 w-10 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <Bar className="h-6 w-40" />
        <Bar className="h-12 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }, (_, i) => <Bar key={i} className="h-44 rounded-3xl" />)}
        </div>
      </div>
    </div>
  );
}
