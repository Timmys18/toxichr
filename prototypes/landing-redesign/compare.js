const allCards = [...document.querySelectorAll("[data-person]")];
const carouselCards = [...document.querySelectorAll(".carousel-card")];
let activeIndex = 0;
let selectedId = null;

function markSelected(id) {
  selectedId = id;
  allCards.forEach((card) => card.setAttribute("aria-pressed", String(card.dataset.person === id)));
}

function showCarouselPosition() {
  const previous = (activeIndex + carouselCards.length - 1) % carouselCards.length;
  const next = (activeIndex + 1) % carouselCards.length;
  carouselCards.forEach((card, index) => {
    card.classList.remove("is-prev", "is-current", "is-next");
    if (index === activeIndex) card.classList.add("is-current");
    else if (index === previous) card.classList.add("is-prev");
    else if (index === next) card.classList.add("is-next");
    card.tabIndex = index === activeIndex || index === previous || index === next ? 0 : -1;
  });
  document.getElementById("carousel-count").textContent = `${String(activeIndex + 1).padStart(2, "0")} / 04`;
}

document.querySelectorAll(".equal-card").forEach((card) => {
  card.addEventListener("click", () => markSelected(card.dataset.person));
});

carouselCards.forEach((card, index) => {
  card.addEventListener("click", () => {
    activeIndex = index;
    markSelected(card.dataset.person);
    showCarouselPosition();
  });
});

document.getElementById("carousel-prev").addEventListener("click", () => {
  activeIndex = (activeIndex + carouselCards.length - 1) % carouselCards.length;
  showCarouselPosition();
});
document.getElementById("carousel-next").addEventListener("click", () => {
  activeIndex = (activeIndex + 1) % carouselCards.length;
  showCarouselPosition();
});
showCarouselPosition();

const fileInput = document.getElementById("resume-file");
const fileState = document.getElementById("upload-state");
document.getElementById("choose-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileState.textContent = /\.(pdf|docx)$/i.test(file.name)
    ? `${file.name} выбран. В макете разбор не запускается.`
    : "Нужен PDF или DOCX.";
});

const pastePanel = document.getElementById("paste-panel");
const textToggle = document.getElementById("toggle-text");
textToggle.addEventListener("click", () => {
  pastePanel.hidden = !pastePanel.hidden;
  textToggle.setAttribute("aria-expanded", String(!pastePanel.hidden));
  document.getElementById("text-action-label").textContent = pastePanel.hidden ? "Вставить текст" : "Скрыть текст";
  if (!pastePanel.hidden) document.getElementById("resume-text").focus();
});
document.getElementById("resume-text").addEventListener("input", (event) => {
  const length = event.target.value.trim().length;
  document.getElementById("paste-state").textContent = length
    ? `${length} символов. Текст остаётся только в этой вкладке.`
    : "Локальный макет: текст останется только в этой вкладке.";
});
