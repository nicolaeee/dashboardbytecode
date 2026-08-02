// Continut static (public/stelute.html, cu logica lui proprie de stele plutitoare) randat
// aici intr-un iframe same-origin, ca navigarea sa ramana in interiorul SPA-ului - sidebar-ul
// din Shell (parintele acestei rute) ramane mereu vizibil, la fel ca /roadmap.
export default function RecompensePage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100dvh-3.5rem)] sm:-mx-5 sm:-my-7 lg:-mx-10 lg:-my-9 lg:h-[100dvh]">
      <iframe src="/stelute.html" title="Recompense" className="h-full w-full border-0" />
    </div>
  );
}
