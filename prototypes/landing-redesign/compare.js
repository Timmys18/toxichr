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
    const visible = index === activeIndex || index === previous || index === next;
    card.tabIndex = visible ? 0 : -1;
    card.setAttribute("aria-hidden", String(!visible));
  });
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

document.querySelector(".carousel-stage").addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  activeIndex = (activeIndex + (event.key === "ArrowRight" ? 1 : carouselCards.length - 1)) % carouselCards.length;
  showCarouselPosition();
  carouselCards[activeIndex].focus();
});
showCarouselPosition();

const fileInput = document.getElementById("resume-file");
const fileState = document.getElementById("upload-state");
document.getElementById("choose-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileState.textContent = /\.(pdf|docx)$/i.test(file.name)
    ? `Выбран файл: ${file.name}`
    : "Нужен PDF или DOCX.";
});

const pastePanel = document.getElementById("paste-panel");
const textToggle = document.getElementById("toggle-text");
textToggle.addEventListener("click", () => {
  pastePanel.hidden = !pastePanel.hidden;
  textToggle.setAttribute("aria-expanded", String(!pastePanel.hidden));
  document.getElementById("text-action-label").textContent = pastePanel.hidden ? "Вставить текст" : "Скрыть текст";
  textToggle.querySelector("small").hidden = !pastePanel.hidden;
  textToggle.querySelector(".comparison-action-arrow").textContent = pastePanel.hidden ? "↗" : "×";
  if (!pastePanel.hidden) {
    document.getElementById("resume-text").focus({ preventScroll: true });
    pastePanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});
document.getElementById("resume-text").addEventListener("input", (event) => {
  const length = event.target.value.trim().length;
  document.getElementById("paste-state").textContent = length
    ? `${length} символов`
    : "";
});
