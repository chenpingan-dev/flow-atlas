export function initLayout() {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "menu-toggle";
  toggle.className = "menu-toggle";
  toggle.setAttribute("aria-label", "Toggle sidebar");
  toggle.setAttribute("title", "Toggle sidebar");
  toggle.setAttribute("aria-controls", "sidebar-menu");
  toggle.setAttribute(
    "aria-expanded",
    String(!matchMedia("(max-width: 760px)").matches),
  );
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  document.querySelector(".sidebar").id = "sidebar-menu";
  document.querySelector(".topbar").prepend(toggle);
  const shade = document.createElement("button");
  shade.type = "button";
  shade.className = "sidebar-shade";
  shade.setAttribute("aria-label", "Close menu");
  document.body.append(shade);
  const close = () => {
    document.body.classList.remove("sidebar-open");
    if (matchMedia("(max-width: 760px)").matches)
      toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    if (matchMedia("(max-width: 760px)").matches) {
      const open = document.body.classList.toggle("sidebar-open");
      toggle.setAttribute("aria-expanded", String(open));
    } else {
      const collapsed = document.body.classList.toggle("sidebar-collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    }
  });
  shade.addEventListener("click", close);
  for (const item of document.querySelectorAll(".side-item")) {
    const label = item.querySelector(".menu-text").textContent.trim();
    item.setAttribute("title", label);
    item.setAttribute("aria-label", label);
    item.addEventListener("click", close);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  matchMedia("(max-width: 760px)").addEventListener("change", (event) => {
    document.body.classList.remove("sidebar-open", "sidebar-collapsed");
    toggle.setAttribute("aria-expanded", String(!event.matches));
  });
}
