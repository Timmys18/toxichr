const people = {
  vadik: { name: "Вадик", role: "Фаундер", focus: "Смотрит на самостоятельность, скорость и влияние на продукт." },
  lera: { name: "Лера", role: "Бигтех", focus: "Смотрит на ясность опыта и соответствие роли." },
  gleb: { name: "Глеб Аркадьевич", role: "Партнёр консалтинга", focus: "Смотрит на логику, факты и уровень заявленной роли." },
  tamara: { name: "Тамара Петровна", role: "HR-директор из нефтегаза", focus: "Смотрит на масштаб, полномочия и стабильность." },
};

function selectPerson(id) {
  const person = people[id];
  if (!person) return;
  const photo = document.getElementById("hero-photo");
  photo.src = `./assets/${id}.jpg`;
  photo.alt = `${person.name}, ${person.role}`;
  document.getElementById("hero-name").textContent = person.name;
  document.getElementById("hero-role").textContent = person.role;
  document.getElementById("hero-focus").textContent = person.focus;
  document.querySelectorAll(".hr-card").forEach((card) => card.classList.toggle("selected", card.dataset.hr === id));
  document.querySelectorAll("[data-select]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.select === id)));
  document.getElementById("top").scrollIntoView({ behavior: "smooth" });
}

document.querySelectorAll("[data-select]").forEach((button) => {
  button.addEventListener("click", () => selectPerson(button.dataset.select));
});
document.querySelector('[data-hr="vadik"]').classList.add("selected");
document.querySelector('[data-select="vadik"]').setAttribute("aria-pressed", "true");

const fileInput = document.getElementById("resume-file");
const dropZone = document.getElementById("drop-zone");
const fileState = document.getElementById("upload-state");
document.getElementById("choose-file").addEventListener("click", () => fileInput.click());

function showFile(file) {
  if (!file) return;
  if (!/\.(pdf|docx)$/i.test(file.name)) {
    fileState.textContent = "Выбери PDF или DOCX.";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    fileState.textContent = "Файл больше 8 МБ.";
    return;
  }
  fileState.textContent = `${file.name} выбран. В этом макете разбор не запускается.`;
}
fileInput.addEventListener("change", () => showFile(fileInput.files?.[0]));
dropZone.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("drag"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag");
  showFile(event.dataTransfer?.files?.[0]);
});

const textToggle = document.getElementById("toggle-text");
const pastePanel = document.getElementById("paste-panel");
textToggle.addEventListener("click", () => {
  pastePanel.hidden = !pastePanel.hidden;
  textToggle.setAttribute("aria-expanded", String(!pastePanel.hidden));
  if (!pastePanel.hidden) document.getElementById("resume-text").focus();
});
document.getElementById("resume-text").addEventListener("input", (event) => {
  const count = event.target.value.trim().length;
  document.getElementById("paste-state").textContent = count
    ? `${count} символов. Текст остаётся только в этой вкладке; разбор в макете не запускается.`
    : "Локальный макет: текст останется только в этой вкладке.";
});
