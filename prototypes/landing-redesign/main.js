const people = {
  vadik: { name: "Вадик", role: "Фаундер", quote: "Ищет автора, не свидетеля" },
  lera: { name: "Лера", role: "Бигтех", quote: "Свайпает карьеру влево" },
  gleb: { name: "Глеб Аркадьевич", role: "Партнёр консалтинга", quote: "Профессионально игнорирует координаторов и фасилитаторов" },
  tamara: { name: "Тамара Петровна", role: "HR-директор из нефтегаза", quote: "The kadrovik" },
};

function selectPerson(id, fromTeam) {
  const person = people[id];
  if (!person) return;
  const photo = document.getElementById("hero-photo");
  photo.src = `./assets/${id}.jpg`;
  photo.alt = `${person.name}, ${person.role}`;
  document.getElementById("hero-name").textContent = person.name;
  document.getElementById("hero-role").textContent = person.role;
  document.getElementById("hero-quote").textContent = person.quote;
  document.querySelectorAll("[data-select]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.select === id));
  });
  if (fromTeam) document.getElementById("top").scrollIntoView({ behavior: "smooth" });
}

document.querySelectorAll("[data-select]").forEach((button) => {
  button.addEventListener("click", () => selectPerson(button.dataset.select, button.classList.contains("team-card")));
});

const fileInput = document.getElementById("resume-file");
const uploadRail = document.getElementById("start");
const fileState = document.getElementById("upload-state");
document.getElementById("choose-file").addEventListener("click", () => fileInput.click());

function showFile(file) {
  if (!file) return;
  if (!/\.(pdf|docx)$/i.test(file.name)) {
    fileState.textContent = "Нужен PDF или DOCX.";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    fileState.textContent = "Файл больше 8 МБ.";
    return;
  }
  fileState.textContent = `${file.name} выбран. В макете разбор не запускается.`;
}
fileInput.addEventListener("change", () => showFile(fileInput.files?.[0]));
uploadRail.addEventListener("dragover", (event) => { event.preventDefault(); uploadRail.classList.add("drag"); });
uploadRail.addEventListener("dragleave", () => uploadRail.classList.remove("drag"));
uploadRail.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadRail.classList.remove("drag");
  showFile(event.dataTransfer?.files?.[0]);
});

const textToggle = document.getElementById("toggle-text");
const pastePanel = document.getElementById("paste-panel");
textToggle.addEventListener("click", () => {
  pastePanel.hidden = !pastePanel.hidden;
  textToggle.setAttribute("aria-expanded", String(!pastePanel.hidden));
  textToggle.textContent = pastePanel.hidden ? "Нет файла? Вставить текст" : "Скрыть текстовое поле";
  if (!pastePanel.hidden) document.getElementById("resume-text").focus();
});
document.getElementById("resume-text").addEventListener("input", (event) => {
  const count = event.target.value.trim().length;
  document.getElementById("paste-state").textContent = count
    ? `${count} символов. Текст остаётся только в этой вкладке.`
    : "Локальный макет: текст останется только в этой вкладке.";
});
