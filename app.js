const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TASK_COUNT = 6;
const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
const DAY_RANGE = DAY_END - DAY_START;
const GRID_STEP = 30;
const BREAKS = [
  { start: toMinutes("11:10"), end: toMinutes("11:25"), label: "Break" },
  { start: toMinutes("13:35"), end: toMinutes("14:20"), label: "Lunch" },
  { start: toMinutes("15:20"), end: toMinutes("15:25"), label: "Break" },
];

const state = {
  placements: [],
};

const els = {
  form: document.querySelector("#planner-form"),
  studentName: document.querySelector("#student-name"),
  weekStart: document.querySelector("#week-start"),
  dayInputs: document.querySelector("#day-inputs"),
  taskList: document.querySelector("#task-list"),
  placeTaskButton: document.querySelector("#place-task-button"),
  autoPlaceButton: document.querySelector("#auto-place-button"),
  clearButton: document.querySelector("#clear-button"),
  printButton: document.querySelector("#print-button"),
  formFeedback: document.querySelector("#form-feedback"),
  summaryStrip: document.querySelector("#summary-strip"),
  warningBanner: document.querySelector("#warning-banner"),
  timeColumn: document.querySelector("#time-column"),
  calendarGrid: document.querySelector("#calendar-grid"),
  dayInputTemplate: document.querySelector("#day-input-template"),
  taskRowTemplate: document.querySelector("#task-row-template"),
  dayColumnTemplate: document.querySelector("#day-column-template"),
};

initialise();

function initialise() {
  els.weekStart.value = getCurrentMonday();
  renderTimeColumn();
  renderDayInputs();
  renderTaskRows();
  bindEvents();
  refreshCalendar();
}

function bindEvents() {
  els.form.addEventListener("submit", handleRefresh);
  els.placeTaskButton.addEventListener("click", handlePlaceSelectedTask);
  els.autoPlaceButton.addEventListener("click", handleAutoPlaceAll);
  els.clearButton.addEventListener("click", handleClearCalendar);
  els.printButton.addEventListener("click", handlePrint);
  els.form.addEventListener("input", handleLiveUpdate);
  els.form.addEventListener("change", handleLiveUpdate);
  els.weekStart.addEventListener("change", () => {
    renderDayDates();
    refreshCalendar();
  });
}

function renderTimeColumn() {
  const labels = [];

  for (let minutes = DAY_START; minutes <= DAY_END; minutes += GRID_STEP) {
    const label = document.createElement("div");
    label.className = "time-label";
    label.textContent = fromMinutes(minutes);
    labels.push(label);
  }

  els.timeColumn.replaceChildren(...labels);
}

function renderDayInputs() {
  const nodes = DAYS.map((day) => {
    const node = els.dayInputTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".day-name").textContent = day;
    return node;
  });

  els.dayInputs.replaceChildren(...nodes);
  renderDayDates();
}

function renderDayDates() {
  Array.from(els.dayInputs.children).forEach((node, index) => {
    node.querySelector(".day-date").textContent = formatDate(addDays(els.weekStart.value || getCurrentMonday(), index));
  });
}

function renderTaskRows() {
  const defaultTasks = [
    ["Task 1", 2],
    ["Task 2", 2],
    ["Task 3", 1.5],
    ["Task 4", 1],
    ["Task 5", 1],
    ["Task 6", 1],
  ];

  const nodes = Array.from({ length: TASK_COUNT }, (_, index) => {
    const node = els.taskRowTemplate.content.firstElementChild.cloneNode(true);
    const [name, hours] = defaultTasks[index];
    node.querySelector(".task-number").textContent = `Task ${index + 1}`;
    node.querySelector(".task-name").value = name;
    node.querySelector(".task-hours").value = hours;
    node.querySelector(".task-select").value = String(index);

    if (index === 0) {
      node.querySelector(".task-select").checked = true;
    }

    return node;
  });

  els.taskList.replaceChildren(...nodes);
}

function handleRefresh(event) {
  event.preventDefault();
  refreshCalendar();
}

function handleLiveUpdate(event) {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (event.target.id === "week-start") {
    return;
  }

  refreshCalendar();
}

function handlePlaceSelectedTask() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  const selectedTaskIndex = getSelectedTaskIndex();
  if (selectedTaskIndex === null) {
    renderValidation("Choose a task first.");
    return;
  }

  const placement = placeTask(config, selectedTaskIndex, 0);
  renderCalendar(config, placement.message);
}

function handleAutoPlaceAll() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  state.placements = [];
  let message = "All tasks placed into the student timetable.";

  config.tasks.forEach((task, index) => {
    if (!task.name || task.minutes <= 0) {
      return;
    }

    const result = placeTask(config, index, 0);
    if (result.remainingMinutes > 0) {
      message = `${task.name} could not fully fit into this week.`;
    }
  });

  renderCalendar(config, message);
}

function handleClearCalendar() {
  state.placements = [];
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendar(config, "Calendar cleared.");
}

function handlePrint() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendar(config, "Ready to print.");
  window.print();
}

function refreshCalendar() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  state.placements = state.placements.filter((placement) => {
    const task = config.tasks[placement.taskIndex];
    const day = config.days[placement.dayIndex];

    return task && task.name && task.minutes > 0 && isPlacementValid(day, placement);
  });

  renderCalendar(config, "Calendar refreshed.");
}

function readForm() {
  if (!els.weekStart.value) {
    return invalid("Choose the Monday for this week.");
  }

  const days = Array.from(els.dayInputs.children).map((node, index) => {
    const enabled = node.querySelector(".day-enabled").checked;
    const start = node.querySelector(".day-start").value;
    const end = node.querySelector(".day-end").value;
    return {
      index,
      name: DAYS[index],
      date: addDays(els.weekStart.value, index),
      enabled,
      start,
      end,
      startMinutes: enabled ? toMinutes(start) : 0,
      endMinutes: enabled ? toMinutes(end) : 0,
    };
  });

  for (const day of days) {
    if (day.enabled && (!day.start || !day.end || day.endMinutes <= day.startMinutes)) {
      return invalid(`Check the on-site hours for ${day.name}.`);
    }
  }

  const tasks = Array.from(els.taskList.children).map((node, index) => ({
    index,
    name: node.querySelector(".task-name").value.trim(),
    minutes: Math.round((Number(node.querySelector(".task-hours").value) || 0) * 60),
  }));

  return {
    valid: true,
    studentName: els.studentName.value.trim() || "Student",
    weekStart: els.weekStart.value,
    days,
    tasks,
  };
}

function placeTask(config, taskIndex, startDayIndex) {
  const task = config.tasks[taskIndex];

  if (!task || !task.name || task.minutes <= 0) {
    return { remainingMinutes: 0, message: "Enter a task name and a length before placing it." };
  }

  state.placements = state.placements.filter((placement) => placement.taskIndex !== taskIndex);

  let remainingMinutes = task.minutes;
  const dayOrder = buildDayOrder(startDayIndex, config.days.length);

  for (const dayIndex of dayOrder) {
    const day = config.days[dayIndex];
    if (!day.enabled || remainingMinutes <= 0) {
      continue;
    }

    const freeSegments = getFreeSegments(day, dayIndex);

    for (const segment of freeSegments) {
      if (remainingMinutes <= 0) {
        break;
      }

      const usedMinutes = Math.min(segment.end - segment.start, remainingMinutes);
      state.placements.push({
        taskIndex,
        dayIndex,
        startMinutes: segment.start,
        endMinutes: segment.start + usedMinutes,
      });
      remainingMinutes -= usedMinutes;
    }
  }

  if (remainingMinutes > 0) {
    return {
      remainingMinutes,
      message: `${task.name} did not fully fit into this week.`,
    };
  }

  return {
    remainingMinutes: 0,
    message: `${task.name} placed into the calendar.`,
  };
}

function getFreeSegments(day, dayIndex) {
  const workingSegments = getWorkingSegments(day);
  const placements = state.placements
    .filter((placement) => placement.dayIndex === dayIndex)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const segments = [];

  for (const workingSegment of workingSegments) {
    let cursor = workingSegment.start;

    for (const placement of placements) {
      if (placement.endMinutes <= workingSegment.start || placement.startMinutes >= workingSegment.end) {
        continue;
      }

      if (placement.startMinutes > cursor) {
        segments.push({ start: cursor, end: placement.startMinutes });
      }

      cursor = Math.max(cursor, Math.min(placement.endMinutes, workingSegment.end));
    }

    if (cursor < workingSegment.end) {
      segments.push({ start: cursor, end: workingSegment.end });
    }
  }

  return segments.filter((segment) => segment.end > segment.start);
}

function renderCalendar(config, message) {
  renderSummary(config);
  renderWeek(config);
  renderWarning(config);
  els.formFeedback.textContent = message;
  els.formFeedback.classList.remove("is-error");
}

function renderSummary(config) {
  const totalCapacity = config.days.reduce(
    (total, day) => total + getWorkingSegments(day).reduce((sum, segment) => sum + (segment.end - segment.start), 0),
    0,
  );
  const totalTaskMinutes = config.tasks.reduce((total, task) => total + (task.name ? task.minutes : 0), 0);
  const placedMinutes = state.placements.reduce((total, placement) => total + (placement.endMinutes - placement.startMinutes), 0);

  const chips = [
    config.studentName,
    `Available this week: ${formatMinutes(totalCapacity)}`,
    `Task time entered: ${formatMinutes(totalTaskMinutes)}`,
    `Task time placed: ${formatMinutes(placedMinutes)}`,
  ].map(renderSummaryChip);

  els.summaryStrip.replaceChildren(...chips);
}

function renderWeek(config) {
  const nodes = config.days.map((day, dayIndex) => {
    const node = els.dayColumnTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".calendar-day-name").textContent = day.name;
    node.querySelector(".calendar-day-date").textContent = formatDate(day.date);
    node.querySelector(".day-place-button").addEventListener("click", () => placeSelectedFromDay(dayIndex));
    const startInput = node.querySelector(".calendar-day-start");
    const endInput = node.querySelector(".calendar-day-end");
    startInput.value = day.start || "09:00";
    endInput.value = day.end || "16:30";
    startInput.disabled = !day.enabled;
    endInput.disabled = !day.enabled;
    startInput.addEventListener("input", () => updateDayTimeFromCalendar(dayIndex, "start", startInput.value));
    endInput.addEventListener("input", () => updateDayTimeFromCalendar(dayIndex, "end", endInput.value));

    const grid = node.querySelector(".calendar-track-grid");
    const availabilityLayer = node.querySelector(".availability-layer");
    const sessionLayer = node.querySelector(".session-layer");

    const lines = [];
    for (let minutes = DAY_START; minutes < DAY_END; minutes += GRID_STEP) {
      const line = document.createElement("div");
      line.className = "calendar-line";
      line.style.top = `${minuteToPercent(minutes)}%`;
      lines.push(line);
    }
    grid.replaceChildren(...lines);

    if (day.enabled) {
      getWorkingSegments(day).forEach((segment) => {
        const availability = document.createElement("div");
        availability.className = "availability-block";
        availability.style.top = `${minuteToPercent(segment.start)}%`;
        availability.style.height = `${durationToPercent(segment.end - segment.start)}%`;
        availability.innerHTML = `
          <span class="availability-time">${fromMinutes(segment.start)} to ${fromMinutes(segment.end)}</span>
          <strong class="availability-length">${formatSegmentMinutes(segment.end - segment.start)}</strong>
        `;
        availabilityLayer.append(availability);
      });

      getBreakSegments(day).forEach((segment) => {
        const breakBlock = document.createElement("div");
        breakBlock.className = "break-block";
        breakBlock.style.top = `${minuteToPercent(segment.start)}%`;
        breakBlock.style.height = `${durationToPercent(segment.end - segment.start)}%`;
        breakBlock.textContent = segment.label;
        availabilityLayer.append(breakBlock);
      });
    } else {
      const offsite = document.createElement("div");
      offsite.className = "offsite-note";
      offsite.textContent = "Off site";
      availabilityLayer.append(offsite);
    }

    const placements = state.placements
      .filter((placement) => placement.dayIndex === dayIndex)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    placements.forEach((placement) => {
      const task = config.tasks[placement.taskIndex];
      const session = document.createElement("article");
      session.className = "session-block";
      session.style.top = `${minuteToPercent(placement.startMinutes)}%`;
      session.style.height = `${durationToPercent(placement.endMinutes - placement.startMinutes)}%`;
      session.innerHTML = `
        <p class="session-time">${fromMinutes(placement.startMinutes)} to ${fromMinutes(placement.endMinutes)}</p>
        <h3>${escapeHtml(task.name)}</h3>
        <p class="session-length">${formatMinutes(placement.endMinutes - placement.startMinutes)}</p>
      `;
      sessionLayer.append(session);
    });

    return node;
  });

  els.calendarGrid.replaceChildren(...nodes);
}

function renderWarning(config) {
  const warnings = [];

  config.tasks.forEach((task) => {
    if (!task.name || task.minutes <= 0) {
      return;
    }

    const placedMinutes = state.placements
      .filter((placement) => placement.taskIndex === task.index)
      .reduce((total, placement) => total + (placement.endMinutes - placement.startMinutes), 0);

    if (placedMinutes < task.minutes) {
      warnings.push(`${task.name} has ${formatMinutes(task.minutes - placedMinutes)} still unplaced`);
    }
  });

  if (warnings.length === 0) {
    els.warningBanner.classList.add("is-hidden");
    els.warningBanner.textContent = "";
    return;
  }

  els.warningBanner.textContent = warnings.join(". ");
  els.warningBanner.classList.remove("is-hidden");
}

function getWorkingSegments(day) {
  if (!day.enabled) {
    return [];
  }

  let segments = [{ start: day.startMinutes, end: day.endMinutes }];

  BREAKS.forEach((breakSlot) => {
    segments = segments.flatMap((segment) => subtractSegment(segment, breakSlot));
  });

  return segments.filter((segment) => segment.end > segment.start);
}

function getBreakSegments(day) {
  if (!day.enabled) {
    return [];
  }

  return BREAKS.map((breakSlot) => ({
    start: Math.max(day.startMinutes, breakSlot.start),
    end: Math.min(day.endMinutes, breakSlot.end),
    label: breakSlot.label,
  })).filter((segment) => segment.end > segment.start);
}

function isPlacementValid(day, placement) {
  if (!day || !day.enabled) {
    return false;
  }

  return getWorkingSegments(day).some(
    (segment) => placement.startMinutes >= segment.start && placement.endMinutes <= segment.end,
  );
}

function subtractSegment(segment, blocked) {
  if (blocked.end <= segment.start || blocked.start >= segment.end) {
    return [segment];
  }

  const nextSegments = [];

  if (blocked.start > segment.start) {
    nextSegments.push({ start: segment.start, end: blocked.start });
  }

  if (blocked.end < segment.end) {
    nextSegments.push({ start: blocked.end, end: segment.end });
  }

  return nextSegments;
}

function renderValidation(message) {
  els.formFeedback.textContent = message;
  els.formFeedback.classList.add("is-error");
}

function updateDayTimeFromCalendar(dayIndex, field, value) {
  const dayNode = els.dayInputs.children[dayIndex];
  if (!dayNode) {
    return;
  }

  const enabledInput = dayNode.querySelector(".day-enabled");
  const startInput = dayNode.querySelector(".day-start");
  const endInput = dayNode.querySelector(".day-end");

  enabledInput.checked = true;

  if (field === "start") {
    startInput.value = value;
  }

  if (field === "end") {
    endInput.value = value;
  }

  refreshCalendar();
}

function placeSelectedFromDay(dayIndex) {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  const selectedTaskIndex = getSelectedTaskIndex();
  if (selectedTaskIndex === null) {
    renderValidation("Choose a task first.");
    return;
  }

  const placement = placeTask(config, selectedTaskIndex, dayIndex);
  renderCalendar(config, placement.message);
}

function getSelectedTaskIndex() {
  const selected = document.querySelector('input[name="selectedTask"]:checked');
  return selected ? Number(selected.value) : null;
}

function buildDayOrder(startIndex, totalDays) {
  const order = [];

  for (let i = 0; i < totalDays; i += 1) {
    order.push((startIndex + i) % totalDays);
  }

  return order;
}

function renderSummaryChip(text) {
  const chip = document.createElement("div");
  chip.className = "summary-chip";
  chip.textContent = text;
  return chip;
}

function minuteToPercent(minutes) {
  return ((minutes - DAY_START) / DAY_RANGE) * 100;
}

function durationToPercent(minutes) {
  return (minutes / DAY_RANGE) * 100;
}

function getCurrentMonday() {
  const today = new Date();
  const day = today.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  today.setDate(today.getDate() + offset);
  return formatDateInput(today);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function formatDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatSegmentMinutes(totalMinutes) {
  return `${totalMinutes}m`;
}

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function invalid(message) {
  return { valid: false, message };
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
