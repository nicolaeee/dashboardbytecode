// Roadmap-ul e continut static (public/roadmap.html, cu logica lui proprie de nivel/bonus)
// randat aici intr-un iframe same-origin, ca navigarea sa ramana in interiorul SPA-ului -
// sidebar-ul din Shell (parintele acestei rute) ramane mereu vizibil, spre deosebire de un
// link direct catre /roadmap.html care ar incarca pagina in afara aplicatiei React.
// Pe telefon iframe-ul ocupa spatiul dintre antetul mobil si bara de jos (vezi Shell.tsx).
export default function RoadmapPage() {
  return (
    <div className="-mx-4 -mt-4 h-[calc(100dvh-var(--mobile-header-h)-5.5rem-env(safe-area-inset-bottom))] lg:-mx-10 lg:-my-9 lg:h-[100dvh]">
      <iframe src="/roadmap.html" title="Roadmap Profesori" className="h-full w-full border-0" />
    </div>
  );
}
