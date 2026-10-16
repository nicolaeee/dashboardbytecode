// Continut static (public/stelute.html, cu logica lui proprie de stele plutitoare) randat
// aici intr-un iframe same-origin, ca navigarea sa ramana in interiorul SPA-ului - sidebar-ul
// din Shell (parintele acestei rute) ramane mereu vizibil, la fel ca /roadmap.
// Pe telefon iframe-ul ocupa spatiul dintre antetul mobil si bara de jos (vezi Shell.tsx).
export default function RecompensePage() {
  return (
    <div className="-mx-4 -mt-4 h-[calc(100dvh-var(--mobile-header-h)-5.5rem-env(safe-area-inset-bottom))] lg:-mx-10 lg:-my-9 lg:h-[100dvh]">
      <iframe src="/stelute.html" title="Recompense" className="h-full w-full border-0" />
    </div>
  );
}
