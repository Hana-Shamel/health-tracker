const TAGS = [
  ["food", "Food"],
  ["medication", "Medication"],
  ["measurement", "Measurement"],
  ["physical activity", "Physical activity"],
  ["symptom", "Symptom"],
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLORS = ["#f7f4ee", "#f2d36b", "#f3a6c8", "#8eb6e8", "#7dbe8a", "#f0a05a", "#e07a7a", "#b59ad6"];
const SHAPES = ["big-round", "small-round", "oval", "capsule", "injection"];
const SHAPE_FILES = {
  "big-round": "/static/svg/pills/big-round.svg",
  "small-round": "/static/svg/pills/small-round.svg",
  oval: "/static/svg/pills/oval.svg",
  capsule: "/static/svg/pills/capsule.svg",
  injection: "/static/svg/pills/syringe.svg",
};
const shapeMarkup = {};

const state = {
  view: null,
  error: "",
  logs: [],
  medicines: [],
  pills: [],
  boxes: [],
  visits: [],
  openDay: {},
  pickedPillId: null,
  pillForm: null,
  boxForm: false,
  editingVisitId: null,
};

let showToken = 0;
let ignoreClickUntil = 0;
const blankDragImage = new Image();
blankDragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function ensureShapes() {
  if (ensureShapes.promise) return ensureShapes.promise;
  ensureShapes.promise = Promise.all(
    Object.entries(SHAPE_FILES).map(async ([shape, url]) => {
      shapeMarkup[shape] = await fetch(url).then((response) => response.text());
    }),
  );
  return ensureShapes.promise;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else node.setAttribute(key, value === true ? "" : String(value));
  });
  children.flat().forEach((child) => {
    if (child != null && child !== false) node.append(child);
  });
  return node;
}

function plusIcon() {
  return el("img", { class: "plus-icon", src: "/static/svg/buttons/plus.svg", alt: "" });
}

function showError(message) {
  state.error = message || "";
  const notice = document.getElementById("notice");
  if (notice) notice.textContent = state.error;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Can't reach the app");
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.detail;
    let message = "Request failed";
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail) && detail.length) message = detail.map((item) => item.msg).join(" ");
    throw new Error(message);
  }
  return body;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function todayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nowTimeValue() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function combine(date, time) {
  if (!date || !time) return null;
  const [hour, minute] = time.split(":");
  if (hour == null || minute == null) return null;
  return `${date}T${pad(hour)}:${pad(minute)}:00`;
}

function splitIso(iso) {
  const [date, time] = iso.split("T");
  return { date, time: time.slice(0, 5) };
}

function parseIso(iso) {
  const { date, time } = splitIso(iso);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatWhen(iso) {
  const date = parseIso(iso);
  const timeLabel = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const dayLabel = date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
  return { timeLabel, dayLabel };
}

function formatDate(value) {
  const date = parseDate(value);
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function courseLabel(endDate) {
  if (!endDate) return "";
  const end = parseDate(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const formatted = formatDate(endDate);
  return end < today ? `Ended ${formatted}` : `Through ${formatted}`;
}

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#cccccc";
}

const SVG_NS = "http://www.w3.org/2000/svg";
let pillSvgSerial = 0;
function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value != null) node.setAttribute(key, String(value));
  });
  children.flat().forEach((child) => {
    if (child) node.append(child);
  });
  return node;
}



function pillNode(pill) {
  const shape = pill.shape || "big-round";
  const color = safeColor(pill.color);
  const right = safeColor(pill.color_right || color);
  const doc = new DOMParser().parseFromString(shapeMarkup[shape], "image/svg+xml");
  const svg = document.importNode(doc.documentElement, true);
  svg.classList.add("pill-svg", shape);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("aria-hidden", "true");

  if (shape === "capsule") {
    const paths = svg.querySelectorAll("path");
    paths[0].setAttribute("fill", color);
    paths[1].setAttribute("fill", right);
  } else if (shape === "injection") {
    svg.querySelector("[id='secondary']").setAttribute("fill", color);
  } else {
    svg.querySelector("circle, ellipse").setAttribute("fill", color);
  }
  return svg;
}

function colorChoices(formState, label, field) {
  const row = el("div", { class: "choice-row", role: "group", "aria-label": label });
  COLORS.forEach((color) => {
    const choice = el("button", {
      type: "button",
      class: "color-choice",
      "aria-label": `${label} ${color}`,
      "aria-pressed": (formState[field] || "").toLowerCase() === color ? "true" : "false",
    });
    choice.style.backgroundColor = color;
    choice.addEventListener("click", () => {
      formState[field] = color;
      paintMedicine();
    });
    row.append(choice);
  });
  const custom = el("input", {
    type: "color",
    "aria-label": label,
    value: safeColor(formState[field]),
  });
  custom.addEventListener("input", () => { formState[field] = custom.value; });
  custom.addEventListener("change", () => paintMedicine());
  const picker = el("label", { class: "color-choice color-picker" }, [
    el("img", { src: "/static/svg/buttons/color-picker.png", alt: "" }),
    custom,
  ]);
  row.append(picker);
  return el("div", { class: "stack-label", text: label }, [row]);
}

function tagGroup(selected) {
  const wrap = el("div", { class: "tag-group", role: "group", "aria-label": "Tags" });
  const buttons = TAGS.map(([value, label]) => {
    const button = el("button", {
      type: "button",
      class: "tag-toggle",
      text: label,
      "aria-pressed": selected.includes(value) ? "true" : "false",
    });
    button.dataset.tag = value;
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", pressed ? "false" : "true");
    });
    return button;
  });
  buttons.forEach((button) => wrap.append(button));
  return {
    element: wrap,
    selected() {
      return buttons
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.dataset.tag);
    },
    press(tag) {
      const button = buttons.find((item) => item.dataset.tag === tag);
      if (button) button.setAttribute("aria-pressed", "true");
    },
  };
}

function medicineSelect(onPick) {
  const select = el("select", { "aria-label": "Add a current box to the text" });
  select.append(el("option", {
    value: "",
    text: state.boxes.length ? "Add a current box" : "No boxes",
    }));
    state.boxes.forEach((box) => {
      select.append(el("option", { value: String(box.id), text: box.title }));
    });
  select.addEventListener("change", () => {
    const box = state.boxes.find((item) => String(item.id) === select.value);
    select.value = "";
    if (box) onPick(box);
  });
  return select;
}

function insertName(input, name) {
  const trimmed = input.value.trimEnd();
  input.value = trimmed ? `${trimmed} ${name}` : name;
}

function viewFromHash() {
  const name = location.hash.replace("#", "");
  return ["log", "medicine", "visits"].includes(name) ? name : "log";
}

function updateNav() {
  document.querySelectorAll(".nav button").forEach((button) => {
    if (button.dataset.view === state.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const titles = { log: "Log", medicine: "Medicine", visits: "Doctor visits" };
  document.title = `Health tracker · ${titles[state.view] || "Log"}`;
}

function renderFatal(message) {
  const app = document.getElementById("app");
  app.replaceChildren(el("div", { class: "page" }, [
    el("p", { class: "notice", text: message, role: "alert" }),
  ]));
}

async function show(view) {
  const token = ++showToken;
  if (view !== state.view) state.error = "";
  state.view = view;
  updateNav();
  try {
    if (view === "log") await renderLogPage(token);
    else if (view === "medicine") await renderMedicinePage(token);
    else await renderVisitsPage(token);
  } catch (error) {
    if (token !== showToken) return;
    renderFatal(error.message);
  }
}

function scrollLogToEnd() {
  const scroller = document.getElementById("log-scroll");
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

async function loadLogs(token, { scroll = "end" } = {}) {
  const previous = document.getElementById("log-scroll")?.scrollTop ?? 0;
  const [logs, boxes] = await Promise.all([
    api("/api/logs"),
    api("/api/pill-boxes"),
  ]);
  if (token != null && token !== showToken) return;
  state.logs = logs;
  state.boxes = boxes;
  paintLog();
  if (scroll === "end") scrollLogToEnd();
  else {
    const scroller = document.getElementById("log-scroll");
    if (scroller) scroller.scrollTop = previous;
  }
}

function paintLog() {
  const app = document.getElementById("app");
  const scroller = el("div", {
    class: state.logs.length ? "log-scroll" : "log-scroll is-empty",
    id: "log-scroll",
  });
  if (!state.logs.length) {
    scroller.append(el("p", { class: "empty", text: "Nothing written yet." }));
  } else {
    state.logs.forEach((entry) => scroller.append(renderEntry(entry)));
  }

  const tags = tagGroup([]);
  const text = el("input", {
    class: "text",
    type: "text",
    maxlength: "4000",
    autocomplete: "off",
    "aria-label": "What happened",
    placeholder: "What happened",
  });
  const date = el("input", { type: "date", "aria-label": "Day", value: todayDateValue(), required: "true" });
  const time = el("input", { type: "time", "aria-label": "Time", value: nowTimeValue(), required: "true" });
  const picker = medicineSelect((box) => {
    insertName(text, box.title);
    tags.press("medication");
    text.focus();
  });
  const form = el("form", { class: "composer" }, [
    date,
    time,
    el("div", { class: "composer-write" }, [
      text,
      el("button", { type: "submit", class: "primary", text: "Add" }),
    ]),
    tags.element,
    picker,
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const occurredAt = combine(date.value, time.value);
    const chosen = tags.selected();
    if (!text.value.trim()) {
      showError("Write what happened");
      return;
    }
    if (!chosen.length) {
      showError("Choose a tag");
      return;
    }
    if (!occurredAt) {
      showError("Choose a day and time");
      return;
    }
    try {
      await api("/api/logs", {
        method: "POST",
        body: JSON.stringify({ occurred_at: occurredAt, text: text.value, tags: chosen }),
      });
      showError("");
      await loadLogs(showToken, { scroll: "end" });
    } catch (error) {
      showError(error.message);
    }
  });

  const layout = el("div", { class: "log-layout" }, [
    el("h1", { class: "sr-only", text: "Log" }),
    scroller,
    el("p", { class: "notice", id: "notice", role: "alert", text: state.error }),
    form,
  ]);
  app.replaceChildren(layout);
}

function renderEntry(entry) {
  const when = formatWhen(entry.occurred_at);
  const actions = el("div", { class: "entry-actions" });
  const article = el("article", { class: "entry", id: `entry-${entry.id}` }, [
    el("div", { class: "entry-when" }, [
      el("div", { class: "entry-time", text: when.timeLabel }),
      el("div", { class: "entry-day", text: when.dayLabel }),
    ]),
    el("p", { class: "entry-text", text: entry.text }),
    el("div", { class: "entry-tags" }, entry.tags.map((tag) => {
      const label = TAGS.find(([value]) => value === tag);
      return el("span", { class: "tag", text: label ? label[1] : tag });
    })),
    actions,
  ]);

  const showActions = () => {
    actions.replaceChildren(
      el("button", { type: "button", class: "text-button", text: "Edit" }),
      el("button", { type: "button", class: "text-button danger", text: "Delete" }),
    );
    actions.children[0].addEventListener("click", () => {
      const form = editForm(entry);
      article.replaceWith(form);
    });
    actions.children[1].addEventListener("click", () => {
      actions.replaceChildren(
        el("span", { class: "confirm-text", text: "Delete this line?" }),
        el("button", { type: "button", class: "text-button danger", text: "Delete" }),
        el("button", { type: "button", class: "text-button", text: "Cancel" }),
      );
      actions.children[1].addEventListener("click", () => deleteLog(entry.id));
      actions.children[2].addEventListener("click", showActions);
    });
  };
  showActions();
  return article;
}

function editForm(entry) {
  const when = splitIso(entry.occurred_at);
  const tags = tagGroup(entry.tags);
  const text = el("input", {
    class: "text",
    type: "text",
    maxlength: "4000",
    autocomplete: "off",
    "aria-label": "What happened",
    value: entry.text,
  });
  const date = el("input", { type: "date", "aria-label": "Day", value: when.date, required: "true" });
  const time = el("input", { type: "time", "aria-label": "Time", value: when.time, required: "true" });
  const picker = medicineSelect((medicine) => {
    insertName(text, medicine.name);
    tags.press("medication");
    text.focus();
  });
  const form = el("form", { class: "entry-edit", id: `entry-${entry.id}` }, [
    date,
    time,
    text,
    tags.element,
    picker,
    el("div", { class: "form-actions" }, [
      el("button", { type: "submit", class: "primary", text: "Save" }),
      el("button", { type: "button", class: "text-button", text: "Cancel" }),
    ]),
  ]);
  form.querySelector(".text-button").addEventListener("click", () => {
    form.replaceWith(renderEntry(entry));
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const occurredAt = combine(date.value, time.value);
    const chosen = tags.selected();
    if (!text.value.trim()) {
      showError("Write what happened");
      return;
    }
    if (!chosen.length) {
      showError("Choose a tag");
      return;
    }
    if (!occurredAt) {
      showError("Choose a day and time");
      return;
    }
    try {
      await api(`/api/logs/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ occurred_at: occurredAt, text: text.value, tags: chosen }),
      });
      showError("");
      await loadLogs(showToken, { scroll: "keep" });
      document.getElementById(`entry-${entry.id}`)?.scrollIntoView({ block: "center" });
    } catch (error) {
      showError(error.message);
    }
  });
  return form;
}

async function deleteLog(id) {
  try {
    await api(`/api/logs/${id}`, { method: "DELETE" });
    showError("");
    await loadLogs(showToken, { scroll: "keep" });
  } catch (error) {
    showError(error.message);
  }
}

async function renderLogPage(token) {
  await loadLogs(token, { scroll: "end" });
}

async function renderMedicinePage(token) {
  await loadMedicine(token);
}

async function loadMedicine(token) {
  const [pills, boxes] = await Promise.all([
    api("/api/pills"),
    api("/api/pill-boxes"),
    ensureShapes(),
  ]);
  if (token != null && token !== showToken) return;
  state.pills = pills;
  state.boxes = boxes;
  boxes.forEach((box) => {
    if (state.openDay[box.id] == null) state.openDay[box.id] = todayIndex();
  });
  if (state.pickedPillId && !pills.some((pill) => pill.id === state.pickedPillId)) {
    state.pickedPillId = null;
  }
  if (state.view === "medicine") paintMedicine();
}

function paintMedicine() {
  const app = document.getElementById("app");
  const previousScroll = document.querySelector("#app .page")?.scrollTop ?? 0;
  const page = el("div", { class: "page" });
  const head = el("div", { class: "page-head" }, [
    el("h1", { text: "Medicine" }),
    el("button", { type: "button", class: "plus", "aria-label": "New pill" }, [plusIcon()]),
  ]);
  head.querySelector("button").addEventListener("click", () => {
    state.pillForm = state.pillForm && state.pillForm.id == null
      ? null
      : { id: null, name: "", description: "", shape: "big-round", color: "#f2d36b", color_right: null};
    paintMedicine();
  });
  page.append(head);
  page.append(el("p", { class: "notice", id: "notice", role: "alert", text: state.error }));
  if (state.pillForm) page.append(pillFormElement());

  page.append(el("h2", { class: "section-label", text: "Saved pills" }));
  page.append(el("p", {
    class: "help",
    text: "Drag a pill into a dashed circle, or select one and click a circle. One day is open at a time.",
  }));
  page.append(pillTray());

  page.append(el("h2", { class: "section-label", text: "Pill boxes" }));
  if (!state.boxes.length) page.append(el("p", { class: "empty", text: "No pill boxes yet." }));
  state.boxes.forEach((box) => page.append(boxElement(box)));
  page.append(addBoxControl());
  app.replaceChildren(page);
  page.scrollTop = previousScroll;
}

function pillFormElement() {
  const formState = state.pillForm;
  const form = el("form", { class: "panel" });
  const name = el("input", {
    type: "text",
    name: "name",
    maxlength: "200",
    required: "true",
    autocomplete: "off",
    value: formState.name,
    placeholder: "Pill name",
    "aria-label": "Pill name",
  });
  const description = el("textarea", {
    name: "description",
    rows: "2",
    maxlength: "4000",
    placeholder: "What it does",
    "aria-label": "What it does",
  });
  description.value = formState.description;
  name.addEventListener("input", () => { formState.name = name.value; });
  description.addEventListener("input", () => { formState.description = description.value; });

  const shapeRow = el("div", { class: "choice-row", role: "group", "aria-label": "Shape" });
  SHAPES.forEach((shape) => {
    const choice = el("button", {
      type: "button",
      class: "shape-choice",
      "aria-label": shape,
      "aria-pressed": formState.shape === shape ? "true" : "false",
    }, [pillNode({ shape, color: formState.color, color_right: formState.color_right })]);
    choice.addEventListener("click", () => {
      formState.shape = shape;
      paintMedicine();
      document.querySelector(".panel [name=name]")?.focus();
    });
    shapeRow.append(choice);
  });

  form.append(
    el("label", { class: "stack-label", text: "Name" }, [name]),
    el("label", { class: "stack-label", text: "What it does" }, [description]),
    el("div", { class: "stack-label", text: "Shape" }, [shapeRow]),
    colorChoices(formState, formState.shape === "capsule" ? "Left side" : "Color", "color"),
    formState.shape === "capsule" ? colorChoices(formState, "Right side", "color_right") : "",
    el("div", { class: "form-actions" }, [
      el("button", { type: "submit", class: "primary", text: "Save pill" }),
      el("button", { type: "button", class: "text-button", text: "Cancel" }),
    ]),
  );
  form.querySelector(".text-button").addEventListener("click", () => {
    state.pillForm = null;
    paintMedicine();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: name.value,
      description: description.value,
      shape: formState.shape,
      color: formState.color,
      color_right: formState.shape === "capsule" ? formState.color_right : null,
    };
    try {
      if (formState.id) {
        await api(`/api/pills/${formState.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/pills", { method: "POST", body: JSON.stringify(payload) });
      }
      state.pillForm = null;
      showError("");
      await loadMedicine(showToken);
    } catch (error) {
      showError(error.message);
    }
  });
  return form;
}

function pillTray() {
  const tray = el("div", { class: "tray" });
  if (!state.pills.length) {
    tray.append(el("p", { class: "empty", text: "No pills yet." }));
    return tray;
  }
  state.pills.forEach((pill) => tray.append(trayCard(pill)));
  return tray;
}

function trayCard(pill) {
  const selected = state.pickedPillId === pill.id;
  const card = el("div", { class: selected ? "tray-pill selected" : "tray-pill" });
  const pick = el("div", {
    class: "pick",
    draggable: "true",
    role: "button",
    tabindex: "0",
    "aria-pressed": selected ? "true" : "false",
    "aria-label": pill.name,
  }, [
    pillNode(pill),
    el("span", { class: "pill-name", text: pill.name }),
    pill.description ? el("span", { class: "pill-desc", text: pill.description }) : null,
  ]);
  pick.addEventListener("click", () => {
    if (Date.now() < ignoreClickUntil) return;
    state.pickedPillId = selected ? null : pill.id;
    paintMedicine();
  });
  pick.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick.click();
    }
  });
  pick.addEventListener("dragstart", (event) => {
    ignoreClickUntil = Date.now() + 400;
    event.dataTransfer.setData("text/plain", JSON.stringify({ kind: "library", pillId: pill.id }));
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setDragImage(blankDragImage, 0, 0);
  
    const ghost = el("div", { class: "drag-ghost" }, [
      pillNode(pill),
      el("span", { class: "pill-name", text: pill.name }),
    ]);
    document.body.append(ghost);
    const place = (dragEvent) => {
      if (!dragEvent.clientX && !dragEvent.clientY) return;
      ghost.style.left = `${dragEvent.clientX}px`;
      ghost.style.top = `${dragEvent.clientY}px`;
    };
    place(event);
    const onDrag = (dragEvent) => place(dragEvent);
    pick.addEventListener("drag", onDrag);
    pick.addEventListener("dragend", () => {
      pick.removeEventListener("drag", onDrag);
      ghost.remove();
    }, { once: true });
  });
  const actions = el("div", { class: "tray-actions" });
  const showActions = () => {
    actions.replaceChildren(
      el("button", { type: "button", class: "text-button", text: "Edit", "aria-label": `Edit ${pill.name}` }),
      el("button", { type: "button", class: "text-button danger", text: "Delete", "aria-label": `Delete ${pill.name}` }),
    );
    actions.children[0].addEventListener("click", () => {
      state.pillForm = {
        id: pill.id,
        name: pill.name,
        description: pill.description,
        shape: pill.shape,
        color: pill.color,
        color_right: pill.color_right,
      };
      paintMedicine();
    });
    actions.children[1].addEventListener("click", () => {
      actions.replaceChildren(
        el("span", { class: "confirm-text", text: "Remove this pill?" }),
        el("button", { type: "button", class: "text-button danger", text: "Remove" }),
        el("button", { type: "button", class: "text-button", text: "Cancel" }),
      );
      actions.children[1].addEventListener("click", () => deletePill(pill.id));
      actions.children[2].addEventListener("click", showActions);
    });
  };
  showActions();
  card.append(pick, actions);
  return card;
}

async function deletePill(id) {
  try {
    await api(`/api/pills/${id}`, { method: "DELETE" });
    if (state.pillForm && state.pillForm.id === id) state.pillForm = null;
    showError("");
    await loadMedicine(showToken);
  } catch (error) {
    showError(error.message);
  }
}

function boxElement(box) {
  const day = state.openDay[box.id] ?? todayIndex();
  const card = el("article", { class: "box-card" });
  const title = el("input", {
    class: "box-title",
    type: "text",
    maxlength: "200",
    value: box.title,
    "aria-label": "Pill box title",
  });
  const description = el("textarea", {
    class: "box-description",
    rows: "2",
    maxlength: "4000",
    "aria-label": "Pill box description",
    placeholder: "Description",
  });
  description.value = box.description;
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });
  title.addEventListener("change", () => saveBoxField(box, title, "title", title.value, "Give the pill box a title"));
  description.addEventListener("change", () => saveBoxField(box, description, "description", description.value));

  const end = el("input", { type: "date", "aria-label": "End date", value: box.end_date || "" });
  const course = el("span", { class: "course", text: courseLabel(box.end_date) });
  end.addEventListener("change", async () => {
    try {
      const updated = await api(`/api/pill-boxes/${box.id}`, {
        method: "PATCH",
        body: JSON.stringify({ end_date: end.value || null }),
      });
      Object.assign(box, updated);
      course.textContent = courseLabel(box.end_date);
      showError("");
    } catch (error) {
      end.value = box.end_date || "";
      showError(error.message);
    }
  });

  const tools = el("div", { class: "box-tools" }, [
    el("button", {
      type: "button",
      class: "text-button",
      text: `Copy ${DAYS[day]} to every day`,
    }),
    el("button", { type: "button", class: "text-button danger", text: "Remove box" }),
  ]);
  tools.children[0].addEventListener("click", () => copyDay(box));
  tools.children[1].addEventListener("click", () => confirmRemoveBox(tools, box));

  const meta = el("div", { class: "box-meta" }, [
    el("label", { class: "end-date", text: "End date" }, [end]),
    course,
    tools,
  ]);
  card.append(title, description, meta, weekElement(box, day));
  return card;
}

async function saveBoxField(box, input, field, value, requiredMessage) {
  const next = value.trim();
  if (requiredMessage && !next) {
    input.value = box[field];
    showError(requiredMessage);
    return;
  }
  if (next === box[field]) return;
  try {
    const updated = await api(`/api/pill-boxes/${box.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: next }),
    });
    Object.assign(box, updated);
    input.value = box[field];
    showError("");
  } catch (error) {
    input.value = box[field];
    showError(error.message);
  }
}

function confirmRemoveBox(tools, box) {
  const copy = tools.children[0];
  tools.replaceChildren(
    copy,
    el("span", { class: "confirm-text", text: "Remove this pill box?" }),
    el("button", { type: "button", class: "text-button danger", text: "Remove" }),
    el("button", { type: "button", class: "text-button", text: "Cancel" }),
  );
  tools.children[2].addEventListener("click", () => deleteBox(box.id));
  tools.children[3].addEventListener("click", () => paintMedicine());
}

async function deleteBox(id) {
  try {
    await api(`/api/pill-boxes/${id}`, { method: "DELETE" });
    delete state.openDay[id];
    showError("");
    await loadMedicine(showToken);
  } catch (error) {
    showError(error.message);
  }
}

async function copyDay(box) {
  const day = state.openDay[box.id] ?? todayIndex();
  const sourceCount = box.placements.filter((item) => item.weekday === day).length;
  const otherCount = box.placements.filter((item) => item.weekday !== day).length;
  if (sourceCount === 0 && otherCount > 0) {
    const ok = window.confirm("This day is empty. Copying it clears the other days.");
    if (!ok) return;
  }
  try {
    await api(`/api/pill-boxes/${box.id}/copy-day`, {
      method: "POST",
      body: JSON.stringify({ weekday: day }),
    });
    showError("");
    await loadMedicine(showToken);
  } catch (error) {
    showError(error.message);
  }
}

function weekElement(box, open) {
  const week = el("div", { class: "week", role: "group", "aria-label": `${box.title} week` });
  const days = el("div", { class: "day-row" });
  for (let weekday = 0; weekday < 7; weekday += 1) {
    days.append(dayButton(box, weekday, weekday === open));
  }
  week.append(days, openDay(box, open));
  return week;
}

function placementsFor(box, weekday) {
  return box.placements
    .filter((item) => item.weekday === weekday)
    .sort((a, b) => a.slot - b.slot)
    .map((item) => state.pills.find((pill) => pill.id === item.pill_id))
    .filter(Boolean);
}

function dayButton(box, weekday, isOpen) {
  const button = el("button", {
    type: "button",
    class: isOpen ? "day open" : "day",
    "aria-label": `Open ${DAYS[weekday]}`,
    "aria-pressed": isOpen ? "true" : "false",
  }, [
    el("span", { class: "day-label", text: DAY_SHORT[weekday] }),
    el("span", { class: "pips" }, placementsFor(box, weekday).map((pill) => {
      const pip = el("i", { class: "pip" });
      pip.style.backgroundColor = safeColor(pill.color);
      return pip;
    })),
  ]);
  button.addEventListener("click", () => {
    if (isOpen) return;
    state.openDay[box.id] = weekday;
    paintMedicine();
  });
  return button;
}

function openDay(box, weekday) {
  const grid = el("div", { class: "slot-grid" });
  for (let slot = 0; slot < 12; slot += 1) {
    grid.append(slotElement(box, weekday, slot));
  }
  return el("div", { class: "day-panel" }, [
    el("div", { class: "lid", text: DAYS[weekday] }),
    el("div", { class: "compartment" }, [grid]),
  ]);
}

function slotElement(box, weekday, slot) {
  const placement = box.placements.find((item) => item.weekday === weekday && item.slot === slot);
  const pill = placement ? state.pills.find((item) => item.id === placement.pill_id) : null;
  const node = el("div", {
    class: pill ? "slot filled" : "slot",
    tabindex: "0",
    "aria-label": pill ? `${pill.name}, slot ${slot + 1}` : `Empty slot ${slot + 1}`,
  });
  if (pill) {
    const shape = pillNode(pill);
    shape.setAttribute("draggable", "true");
    shape.title = pill.description ? `${pill.name}. ${pill.description}` : pill.name;
    shape.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", JSON.stringify({
        kind: "slot",
        pillId: pill.id,
        boxId: box.id,
        weekday,
        slot,
      }));
      event.dataTransfer.effectAllowed = "move";
      event.stopPropagation();
    });
    const clear = el("button", {
      type: "button",
      class: "clear",
      "aria-label": `Remove ${pill.name}`,
      text: "×",
    });
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      assignSlot(box.id, weekday, slot, null);
    });
    node.append(shape, clear, el("span", { class: "slot-name", text: pill.name }));
  }
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove("over");
  });
  node.addEventListener("drop", (event) => {
    event.preventDefault();
    ignoreClickUntil = Date.now() + 400;
    node.classList.remove("over");
    const payload = readDrag(event);
    if (!payload || !payload.pillId) return;
    const source = payload.kind === "slot"
      ? { boxId: payload.boxId, weekday: payload.weekday, slot: payload.slot }
      : null;
    assignSlot(box.id, weekday, slot, payload.pillId, source);
  });
  node.addEventListener("click", () => {
    if (Date.now() < ignoreClickUntil) return;
    if (!state.pickedPillId) return;
    assignSlot(box.id, weekday, slot, state.pickedPillId);
  });
  node.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && state.pickedPillId) {
      event.preventDefault();
      assignSlot(box.id, weekday, slot, state.pickedPillId);
    }
  });
  return node;
}

function readDrag(event) {
  try {
    return JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return null;
  }
}

async function assignSlot(boxId, weekday, slot, pillId, source) {
  if (source && source.boxId === boxId && source.weekday === weekday && source.slot === slot && pillId) return;
  const box = state.boxes.find((item) => item.id === boxId);
  const target = box?.placements.find((item) => item.weekday === weekday && item.slot === slot);
  try {
    if (source) {
      const replacement = target ? target.pill_id : null;
      if (!(source.boxId === boxId && source.weekday === weekday && source.slot === slot)) {
        await setSlot(source.boxId, source.weekday, source.slot, replacement);
      }
    }
    await setSlot(boxId, weekday, slot, pillId);
    showError("");
  } catch (error) {
    showError(error.message);
  }
  try {
    await loadMedicine(showToken);
  } catch (error) {
    showError(error.message);
  }
}

function setSlot(boxId, weekday, slot, pillId) {
  return api(`/api/pill-boxes/${boxId}/slots`, {
    method: "PUT",
    body: JSON.stringify({ weekday, slot, pill_id: pillId }),
  });
}

function addBoxControl() {
  const wrap = el("div");
  const plus = el("button", { type: "button", class: "add-box", "aria-label": "Add pill box" }, [plusIcon()]);
  plus.addEventListener("click", () => {
    state.boxForm = !state.boxForm;
    paintMedicine();
  });
  wrap.append(plus);
  if (!state.boxForm) return wrap;
  const title = el("input", {
    type: "text",
    maxlength: "200",
    required: "true",
    autocomplete: "off",
    placeholder: "Title",
    "aria-label": "Pill box title",
  });
  const description = el("input", {
    type: "text",
    maxlength: "4000",
    autocomplete: "off",
    placeholder: "Description",
    "aria-label": "Pill box description",
  });
  const form = el("form", { class: "panel" }, [
    title,
    description,
    el("div", { class: "form-actions" }, [
      el("button", { type: "submit", class: "primary", text: "Add pill box" }),
      el("button", { type: "button", class: "text-button", text: "Cancel" }),
    ]),
  ]);
  form.querySelector(".text-button").addEventListener("click", () => {
    state.boxForm = false;
    paintMedicine();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!title.value.trim()) {
      showError("Give the pill box a title");
      return;
    }
    try {
      await api("/api/pill-boxes", {
        method: "POST",
        body: JSON.stringify({ title: title.value, description: description.value }),
      });
      state.boxForm = false;
      showError("");
      await loadMedicine(showToken);
    } catch (error) {
      showError(error.message);
    }
  });
  wrap.append(form);
  return wrap;
}

async function renderVisitsPage(token) {
  state.visits = await api("/api/visits");
  if (token !== showToken) return;
  paintVisits();
}

function paintVisits() {
  const app = document.getElementById("app");
  const page = el("div", { class: "page" });
  page.append(el("div", { class: "page-head" }, [el("h1", { text: "Doctor visits" })]));
  page.append(el("p", { class: "notice", id: "notice", role: "alert", text: state.error }));
  page.append(visitForm());
  const list = el("div", { class: "visit-list" });
  if (!state.visits.length) list.append(el("p", { class: "empty", text: "No visits yet." }));
  state.visits.forEach((visit) => list.append(visitCard(visit)));
  page.append(list);
  app.replaceChildren(page);
  const editing = state.visits.find((visit) => visit.id === state.editingVisitId);
  if (editing) fillVisitForm(editing);
}

function visitForm() {
  const date = el("input", { type: "date", id: "visit-date", required: "true", value: todayDateValue() });
  const kind = el("input", {
    type: "text",
    id: "visit-kind",
    maxlength: "200",
    required: "true",
    autocomplete: "off",
    placeholder: "Cardiologist",
  });
  const name = el("input", {
    type: "text",
    id: "visit-name",
    maxlength: "200",
    required: "true",
    autocomplete: "off",
  });
  const conclusion = el("textarea", { id: "visit-conclusion", rows: "3", maxlength: "8000" });
  const prescription = el("textarea", { id: "visit-prescription", rows: "3", maxlength: "8000" });
  const nextSteps = el("textarea", { id: "visit-next", rows: "3", maxlength: "8000" });
  const submit = el("button", { type: "submit", class: "primary", id: "visit-submit", text: "Add visit" });
  const cancel = el("button", { type: "button", class: "text-button", id: "visit-cancel", text: "Cancel", hidden: true });
  const form = el("form", { class: "visit-form", id: "visit-form" }, [
    el("div", { class: "visit-form-grid" }, [
      el("label", { text: "Date" }, [date]),
      el("label", { text: "Kind of doctor" }, [kind]),
      el("label", { text: "Doctor's name" }, [name]),
    ]),
    el("label", { class: "stack-label", text: "Conclusion" }, [conclusion]),
    el("label", { class: "stack-label", text: "Prescription" }, [prescription]),
    el("label", { class: "stack-label", text: "Next steps" }, [nextSteps]),
    el("div", { class: "form-actions" }, [submit, cancel]),
  ]);
  cancel.addEventListener("click", () => {
    state.editingVisitId = null;
    clearVisitForm();
    markEditingVisit();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      visit_date: date.value,
      doctor_kind: kind.value,
      doctor_name: name.value,
      conclusion: conclusion.value,
      prescription: prescription.value,
      next_steps: nextSteps.value,
    };
    if (!payload.visit_date || !payload.doctor_kind.trim() || !payload.doctor_name.trim()) {
      showError("Enter the date, kind of doctor, and doctor's name");
      return;
    }
    try {
      if (state.editingVisitId) {
        await api(`/api/visits/${state.editingVisitId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/visits", { method: "POST", body: JSON.stringify(payload) });
      }
      state.editingVisitId = null;
      showError("");
      await renderVisitsPage(showToken);
    } catch (error) {
      showError(error.message);
    }
  });
  return form;
}

function clearVisitForm() {
  const form = document.getElementById("visit-form");
  if (!form) return;
  form.reset();
  document.getElementById("visit-date").value = todayDateValue();
  document.getElementById("visit-submit").textContent = "Add visit";
  document.getElementById("visit-cancel").hidden = true;
}

function fillVisitForm(visit) {
  document.getElementById("visit-date").value = visit.visit_date;
  document.getElementById("visit-kind").value = visit.doctor_kind;
  document.getElementById("visit-name").value = visit.doctor_name;
  document.getElementById("visit-conclusion").value = visit.conclusion;
  document.getElementById("visit-prescription").value = visit.prescription;
  document.getElementById("visit-next").value = visit.next_steps;
  document.getElementById("visit-submit").textContent = "Save visit";
  document.getElementById("visit-cancel").hidden = false;
  markEditingVisit();
}

function markEditingVisit() {
  document.querySelectorAll(".visit").forEach((node) => {
    node.classList.toggle("is-editing", Number(node.dataset.id) === state.editingVisitId);
  });
}

function visitCard(visit) {
  const actions = el("div", { class: "visit-actions" });
  const card = el("article", { class: "visit", "data-id": String(visit.id) }, [
    el("div", { class: "visit-top" }, [
      el("div", {}, [
        el("div", { class: "visit-kind", text: visit.doctor_kind }),
        el("h2", { text: visit.doctor_name }),
      ]),
      el("div", { class: "visit-date", text: formatDate(visit.visit_date) }),
    ]),
    visitBlock("Conclusion", visit.conclusion),
    visitBlock("Prescription", visit.prescription),
    visitBlock("Next steps", visit.next_steps),
    actions,
  ]);
  const showActions = () => {
    actions.replaceChildren(
      el("button", { type: "button", class: "text-button", text: "Edit", "aria-label": `Edit visit with ${visit.doctor_name}` }),
      el("button", { type: "button", class: "text-button danger", text: "Delete", "aria-label": `Delete visit with ${visit.doctor_name}` }),
    );
    actions.children[0].addEventListener("click", () => {
      state.editingVisitId = visit.id;
      fillVisitForm(visit);
      document.getElementById("visit-form").scrollIntoView({ block: "start" });
    });
    actions.children[1].addEventListener("click", () => {
      actions.replaceChildren(
        el("span", { class: "confirm-text", text: "Delete this visit?" }),
        el("button", { type: "button", class: "text-button danger", text: "Delete" }),
        el("button", { type: "button", class: "text-button", text: "Cancel" }),
      );
      actions.children[1].addEventListener("click", () => deleteVisit(visit.id));
      actions.children[2].addEventListener("click", showActions);
    });
  };
  showActions();
  return card;
}

function visitBlock(title, text) {
  if (!text) return null;
  return el("div", { class: "visit-block" }, [
    el("h3", { text: title }),
    el("p", { text }),
  ]);
}

async function deleteVisit(id) {
  try {
    await api(`/api/visits/${id}`, { method: "DELETE" });
    if (state.editingVisitId === id) state.editingVisitId = null;
    showError("");
    await renderVisitsPage(showToken);
  } catch (error) {
    showError(error.message);
  }
}

function init() {
  document.querySelector(".nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    location.hash = button.dataset.view;
  });
  window.addEventListener("hashchange", () => show(viewFromHash()));
  document.addEventListener("dragend", () => {
    document.querySelectorAll(".slot.over").forEach((node) => node.classList.remove("over"));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.pickedPillId) {
      state.pickedPillId = null;
      if (state.view === "medicine") paintMedicine();
    }
  });
  const view = viewFromHash();
  if (!location.hash) history.replaceState(null, "", "#log");
  show(view);
}

init();
