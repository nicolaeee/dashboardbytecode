// Roadmap-ul e continut static (public/roadmap.html, cu logica lui proprie de nivel/bonus)
// randat aici intr-un iframe same-origin, ca navigarea sa ramana in interiorul SPA-ului -
// sidebar-ul din Shell (parintele acestei rute) ramane mereu vizibil, spre deosebire de un
// link direct catre /roadmap.html care ar incarca pagina in afara aplicatiei React.
export default function RoadmapPage() {
  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-3.5rem)] sm:-mx-5 sm:-my-7 lg:-mx-10 lg:-my-9 lg:h-screen">
      <iframe src="/roadmap.html" title="Roadmap Profesori" className="h-full w-full border-0" />
    </div>
  );
}
