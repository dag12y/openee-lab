import "./style.css";
import { experiments } from "./catalog";
import { element } from "./ui";

const app = document.querySelector<HTMLDivElement>("#app")!;
const skip = element("a", "Skip to content", "skip");
skip.href = "#content";
skip.addEventListener("click", event => { event.preventDefault(); main.focus(); });
const header = element("header", undefined, "topbar");
const brand = element("a", undefined, "brand");
brand.href = "#/";
const mark = element("span", "∿", "mark");
mark.setAttribute("aria-hidden", "true");
brand.append(mark, element("span", "OpenEE Lab"));
const nav = element("nav");
nav.setAttribute("aria-label", "Primary");
const catalogLink = element("a", "Guided simulations");
catalogLink.href = "#/";
nav.append(catalogLink);
header.append(brand, nav);
const main = element("main");
main.id = "content";
main.tabIndex = -1;
const footer = element("footer", "OpenEE Lab · Engineering simulation workspace");
app.append(skip, header, main, footer);

let cleanup: (() => void) | undefined;
function render(focus: boolean) {
  cleanup?.();
  cleanup = undefined;
  main.replaceChildren();
  const path = location.hash.slice(1) || "/";
  const experiment = experiments.find(item => `/labs/${item.slug}` === path && item.mount);
  catalogLink.setAttribute("aria-current", path === "/" ? "page" : "false");
  if (experiment?.mount) {
    cleanup = experiment.mount(main);
    document.title = `${experiment.title} | OpenEE Lab`;
  } else if (path === "/") {
    document.title = "Guided simulations | OpenEE Lab";
    const intro = element("header", undefined, "catalog-heading");
    intro.append(element("h1", "Guided simulations"),
      element("p", "Explore electrical engineering through interactive models and measured signal outputs.", "lede"));
    main.append(intro);
    const available = element("section");
    available.append(element("h2", "Available now", "section-label"));
    for (const item of experiments.filter(item => item.mount)) {
      const card = element("article", undefined, "panel feature");
      const link = element("a", `Open ${item.title} →`, "launch");
      link.href = `#/labs/${item.slug}`;
      card.append(element("p", item.chapter, "eyebrow"),
        element("h3", item.title), element("p", item.description, "muted"), link);
      available.append(card);
    }
    const planned = element("section", undefined, "planned");
    planned.append(element("h2", "Planned experiments", "section-label"));
    const grid = element("ul", undefined, "catalog-grid");
    for (const item of experiments.filter(item => !item.mount)) {
      const entry = element("li", undefined, "panel planned-card");
      entry.append(element("p", item.chapter, "eyebrow"), element("h3", item.title),
        element("p", "Unavailable", "muted"));
      grid.append(entry);
    }
    planned.append(grid);
    main.append(available, planned);
  } else {
    document.title = "Experiment unavailable | OpenEE Lab";
    main.append(element("h1", "Experiment unavailable"), element("p", "Choose an available experiment in Guided simulations."));
  }
  if (focus) main.focus();
}
addEventListener("hashchange", () => render(true));
addEventListener("pagehide", event => { if (!event.persisted) cleanup?.(); });
render(false);
