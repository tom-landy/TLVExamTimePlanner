const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKS = 4;
const TOTAL_DAYS = DAYS.length * WEEKS;
const TASK_COUNT = 6;
const READING_MINUTES = 30;
const DAY_START = 9 * 60;
const DAY_END = 16.5 * 60;
const DAY_RANGE = DAY_END - DAY_START;
const GRID_STEP = 30;
const BUFFER_MINUTES = 10;
const BREAKS = [
  { start: toMinutes("11:10"), end: toMinutes("11:25"), label: "Break" },
  { start: toMinutes("13:35"), end: toMinutes("14:15"), label: "Lunch" },
];
const EXAM_TASKS = {
  ESP: ["Task 1.1", "Task 1.2", "Task 1.3", "Task 1.4", "Task 2.1", "Task 2.2"],
  OSP: ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6"],
};
const EXAM_TASK_MINUTES = {
  ESP: [480, 210, 240, 210, 150, 210],
  OSP: [480, 360, 360, 180, 180, 360],
};
const EXAM_EXTRA_EXEMPT_MINUTES = {
  ESP: [0, 0, 0, 30, 30, 0],
  OSP: [0, 0, 15, 0, 0, 0],
};

const state = {
  placements: [],
  daySettings: [],
  bankHolidayIndexes: new Set(),
};

const els = {
  form: document.querySelector("#planner-form"),
  timingType: document.querySelector("#timing-type"),
  weekStart: document.querySelector("#week-start"),
  examType: document.querySelector("#exam-type"),
  taskList: document.querySelector("#task-list"),
  placeTaskButton: document.querySelector("#place-task-button"),
  autoPlaceButton: document.querySelector("#auto-place-button"),
  clearButton: document.querySelector("#clear-button"),
  printButton: document.querySelector("#print-button"),
  formFeedback: document.querySelector("#form-feedback"),
  summaryStrip: document.querySelector("#summary-strip"),
  warningBanner: document.querySelector("#warning-banner"),
  weeksStack: document.querySelector("#weeks-stack"),
  printSheet: document.querySelector("#print-sheet"),
  taskRowTemplate: document.querySelector("#task-row-template"),
  weekTemplate: document.querySelector("#week-template"),
  dayColumnTemplate: document.querySelector("#day-column-template"),
};

initialise();

function initialise() {
  els.weekStart.value = getCurrentMonday();
  initialiseDaySettings();
  renderTaskRows();
  bindEvents();
  refreshCalendar();
}

function initialiseDaySettings() {
  state.daySettings = Array.from({ length: DAYS.length }, () => ({
    enabled: true,
    start: "09:00",
    end: "16:30",
  }));
}

function bindEvents() {
  els.form.addEventListener("submit", handleRefresh);
  els.form.addEventListener("change", handleLiveUpdate);
  els.placeTaskButton.addEventListener("click", handlePlaceSelectedTask);
  els.autoPlaceButton.addEventListener("click", handleAutoPlaceAll);
  els.clearButton.addEventListener("click", handleClearCalendar);
  els.printButton.addEventListener("click", handlePrint);
  els.examType.addEventListener("change", handleExamTypeChange);
  els.timingType.addEventListener("change", handleExamTypeChange);
  els.weekStart.addEventListener("change", refreshCalendar);
}

function renderTaskRows() {
  const taskNames = getExamTaskNames(els.examType.value);
  const defaultDurations = getExamDefaultHours(els.examType.value, els.timingType.value);

  const nodes = Array.from({ length: TASK_COUNT }, (_, index) => {
    const node = els.taskRowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".task-number").textContent = `Task ${index + 1}`;
    node.querySelector(".task-name").value = taskNames[index];
    node.querySelector(".task-hours").value = String(defaultDurations[index]);
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

  if (event.target instanceof HTMLInputElement && event.target.type === "time" && !isCompleteTimeValue(event.target.value)) {
    return;
  }

  refreshCalendar();
}

function handleExamTypeChange() {
  const taskNames = getExamTaskNames(els.examType.value);
  const durations = getExamDefaultHours(els.examType.value, els.timingType.value);

  Array.from(els.taskList.children).forEach((node, index) => {
    node.querySelector(".task-name").value = taskNames[index];
    node.querySelector(".task-hours").value = String(durations[index]);
  });

  state.placements = [];
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
  renderCalendars(config, placement.message);
}

function handleAutoPlaceAll() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  state.placements = [];
  let nextStartDayIndex = 0;
  let message = "All tasks placed across the four-week timetable.";

  for (let taskIndex = 0; taskIndex < config.tasks.length; taskIndex += 1) {
    const task = config.tasks[taskIndex];
    if (!task.name || task.minutes <= 0) {
      continue;
    }

    const result = placeTask(config, taskIndex, nextStartDayIndex);
    const placementDays = state.placements.filter((placement) => placement.taskIndex === taskIndex).map((placement) => placement.dayIndex);

    if (placementDays.length > 0) {
      nextStartDayIndex = Math.max(...placementDays) + 1;
    }

    if (result.remainingMinutes > 0) {
      message = `${task.name} could not fully fit into the four-week timetable.`;
      break;
    }
  }

  renderCalendars(config, message);
}

function handleClearCalendar() {
  state.placements = [];
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendars(config, "Calendars cleared.");
}

function handlePrint() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendars(config, "Ready to print.");
  renderPrintSheet(config);
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

  renderCalendars(config, "Calendars refreshed.");
}

function readForm() {
  if (!els.weekStart.value) {
    return invalid("Choose the Monday for the first week.");
  }

  const weekdaySettings = state.daySettings.map((daySetting, index) => ({
    weekdayIndex: index,
    name: DAYS[index],
    enabled: daySetting.enabled,
    start: daySetting.start,
    end: daySetting.end,
    startMinutes: daySetting.enabled ? toMinutes(daySetting.start) : 0,
    endMinutes: daySetting.enabled ? toMinutes(daySetting.end) : 0,
  }));

  for (const day of weekdaySettings) {
    if (day.enabled && (!day.start || !day.end || day.endMinutes <= day.startMinutes)) {
      return invalid(`Check the hours for ${day.name}.`);
    }
  }

  const days = Array.from({ length: TOTAL_DAYS }, (_, index) => {
    const weekdayIndex = index % DAYS.length;
    const weekday = weekdaySettings[weekdayIndex];
    const isBankHoliday = state.bankHolidayIndexes.has(index);

    return {
      index,
      weekdayIndex,
      name: weekday.name,
      date: addPlannerDays(els.weekStart.value, index),
      enabled: weekday.enabled && !isBankHoliday,
      start: weekday.start,
      end: weekday.end,
      startMinutes: weekday.startMinutes,
      endMinutes: weekday.endMinutes,
      weekIndex: Math.floor(index / DAYS.length),
      isBankHoliday,
    };
  });

  const tasks = Array.from(els.taskList.children).map((node, index) => ({
    index,
    name: node.querySelector(".task-name").value.trim(),
    minutes: Math.round((Number(node.querySelector(".task-hours").value) || 0) * 60),
  }));

  return {
    valid: true,
    timingType: els.timingType.value,
    examType: els.examType.value,
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

    const freeSegments = getFreeSegments(day, dayIndex, config);

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
    return { remainingMinutes, message: `${task.name} did not fully fit into the four-week timetable.` };
  }

  return { remainingMinutes: 0, message: `${task.name} placed into the calendars.` };
}

function getFreeSegments(day, dayIndex, config) {
  const workingSegments = getWorkingSegments(day, config);
  const placements = state.placements
    .filter((placement) => placement.dayIndex === dayIndex)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return subtractPlacementsFromSegments(workingSegments, placements);
}

function getRemainingAvailabilitySegments(day, dayIndex, config) {
  const workingSegments = getWorkingSegments(day, config);
  const placements = getScheduledPlacements(config)
    .filter((placement) => placement.dayIndex === dayIndex)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  return subtractPlacementsFromSegments(workingSegments, placements);
}

function subtractPlacementsFromSegments(workingSegments, placements) {
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

function renderCalendars(config, message) {
  renderSummary(config);
  renderWeeks(config);
  renderWarning(config);
  renderPrintSheet(config);
  els.formFeedback.textContent = message;
  els.formFeedback.classList.remove("is-error");
}

function renderPrintSheet(config) {
  const printSheet = els.printSheet;
  const placements = getSortedPlacements(config);
  const heading = document.createElement("div");
  heading.className = "print-heading";
  heading.innerHTML = `
    <h2>TLV Exam Calendar</h2>
    <div class="print-meta">
      <span>Exam: ${escapeHtml(config.examType)}</span>
      <span>Timing: ${escapeHtml(capitalise(config.timingType))}</span>
      <span>Start week: ${escapeHtml(formatLongDate(config.weekStart))}</span>
    </div>
  `;

  const table = document.createElement("table");
  table.className = "print-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Week</th>
        <th>Day</th>
        <th>Date</th>
        <th>Task</th>
        <th>Start</th>
        <th>End</th>
        <th>Duration</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");

  if (placements.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7">No task sessions have been placed yet.</td>';
    tbody.append(row);
  } else {
    placements.forEach((placement) => {
      const day = config.days[placement.dayIndex];
      const taskLabel = placement.kind === "reading" ? placement.label : config.tasks[placement.taskIndex]?.name;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>Week ${day.weekIndex + 1}</td>
        <td>${escapeHtml(day.name)}</td>
        <td>${escapeHtml(formatLongDate(day.date))}</td>
        <td>${escapeHtml(taskLabel || "")}</td>
        <td>${escapeHtml(fromMinutes(placement.startMinutes))}</td>
        <td>${escapeHtml(fromMinutes(placement.endMinutes))}</td>
        <td>${escapeHtml(formatMinutes(placement.endMinutes - placement.startMinutes))}</td>
      `;
      tbody.append(row);
    });
  }

  table.append(tbody);
  printSheet.replaceChildren(heading, table);
}

function renderSummary(config) {
  const totalCapacity = config.days.reduce(
    (total, day) => total + getWorkingSegments(day, config).reduce((sum, segment) => sum + (segment.end - segment.start), 0),
    0,
  );
  const totalTaskMinutes = config.tasks.reduce((total, task) => total + (task.name ? task.minutes : 0), 0);
  const placedMinutes = state.placements.reduce((total, placement) => total + (placement.endMinutes - placement.startMinutes), 0);

  const chips = [
    `Timing: ${capitalise(config.timingType)}`,
    `Exam: ${config.examType}`,
    `Weeks: ${WEEKS}`,
    `Available: ${formatMinutes(totalCapacity)}`,
    `Tasks entered: ${formatMinutes(totalTaskMinutes)}`,
    `Placed: ${formatMinutes(placedMinutes)}`,
  ].map(renderSummaryChip);

  els.summaryStrip.replaceChildren(...chips);
}

function renderWeeks(config) {
  const weekNodes = [];

  for (let weekIndex = 0; weekIndex < WEEKS; weekIndex += 1) {
    const weekNode = els.weekTemplate.content.firstElementChild.cloneNode(true);
    const weekDays = config.days.slice(weekIndex * DAYS.length, (weekIndex + 1) * DAYS.length);
    weekNode.querySelector(".week-label").textContent = `Week ${weekIndex + 1}`;
    weekNode.querySelector(".week-range").textContent = `${formatDate(weekDays[0].date)} to ${formatDate(weekDays[weekDays.length - 1].date)}`;

    const dayNodes = weekDays.map((day) => renderDay(day, config));
    weekNode.querySelector(".calendar-grid").replaceChildren(...dayNodes);
    weekNodes.push(weekNode);
  }

  els.weeksStack.replaceChildren(...weekNodes);
}

function renderDay(day, config) {
  const node = els.dayColumnTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".calendar-day-name").textContent = day.name;
  node.querySelector(".calendar-day-date").textContent = formatDate(day.date);

  const enabledInput = node.querySelector(".calendar-day-enabled");
  const bankHolidayToggle = node.querySelector(".bank-holiday-toggle");
  const bankHolidayInput = node.querySelector(".calendar-day-bank-holiday");
  const startInput = node.querySelector(".calendar-day-start");
  const endInput = node.querySelector(".calendar-day-end");
  const isMonday = day.name === "Monday";
  enabledInput.checked = day.enabled;
  bankHolidayInput.checked = day.isBankHoliday;
  bankHolidayToggle.classList.toggle("is-hidden", !isMonday);
  startInput.value = day.start || "09:00";
  endInput.value = day.end || "16:30";
  startInput.disabled = !day.enabled;
  endInput.disabled = !day.enabled;
  enabledInput.addEventListener("change", () => updateDayEnabledFromCalendar(day.index, enabledInput.checked));
  bankHolidayInput.addEventListener("change", () => updateDayBankHoliday(day.index, bankHolidayInput.checked));
  startInput.addEventListener("change", () => updateDayTimeFromCalendar(day.index, "start", startInput.value));
  endInput.addEventListener("change", () => updateDayTimeFromCalendar(day.index, "end", endInput.value));

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
    getRemainingAvailabilitySegments(day, day.index, config).forEach((segment) => {
      const durationMinutes = segment.end - segment.start;
      const availability = document.createElement("div");
      availability.className = "availability-block";
      if (durationMinutes <= 70) {
        availability.classList.add("availability-compact");
      }
      if (durationMinutes <= 35) {
        availability.classList.add("availability-tight");
      }
      availability.style.top = `${minuteToPercent(segment.start)}%`;
      availability.style.height = `${durationToPercent(durationMinutes)}%`;
      availability.innerHTML = `
        <span class="availability-time">${fromMinutes(segment.start)} to ${fromMinutes(segment.end)}</span>
        <strong class="availability-length">${formatSegmentMinutes(durationMinutes)}</strong>
      `;
      availabilityLayer.append(availability);
    });

    getBreakSegments(day).forEach((segment) => {
      const durationMinutes = segment.end - segment.start;
      const breakBlock = document.createElement("div");
      breakBlock.className = "break-block";
      if (durationMinutes <= 20) {
        breakBlock.classList.add("break-compact");
      }
      breakBlock.style.top = `${minuteToPercent(segment.start)}%`;
      breakBlock.style.height = `${durationToPercent(durationMinutes)}%`;
      breakBlock.textContent = segment.label;
      availabilityLayer.append(breakBlock);
    });
  } else {
    const offsite = document.createElement("div");
    offsite.className = "offsite-note";
    offsite.textContent = day.isBankHoliday ? "Bank holiday" : "Not in";
    availabilityLayer.append(offsite);
  }

  const placements = getScheduledPlacements(config)
    .filter((placement) => placement.dayIndex === day.index)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  placements.forEach((placement) => {
    const durationMinutes = placement.endMinutes - placement.startMinutes;
    const session = document.createElement("article");
    const isReading = placement.kind === "reading";
    const task = isReading ? { name: placement.label } : config.tasks[placement.taskIndex];
    session.className = `session-block${isReading ? " reading-session" : ""}`;
    if (durationMinutes <= 75) {
      session.classList.add("session-compact");
    }
    if (durationMinutes <= 45) {
      session.classList.add("session-tight");
    }
    session.style.top = `${minuteToPercent(placement.startMinutes)}%`;
    session.style.height = `${durationToPercent(durationMinutes)}%`;
    session.innerHTML = `
      <p class="session-time">${fromMinutes(placement.startMinutes)} to ${fromMinutes(placement.endMinutes)}</p>
      <h3>${escapeHtml(task.name)}</h3>
      <p class="session-length">${formatMinutes(durationMinutes)}</p>
    `;
    sessionLayer.append(session);
  });

  return node;
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

function getSortedPlacements(config) {
  return [...getScheduledPlacements(config)].sort((a, b) => {
    const dayDelta = a.dayIndex - b.dayIndex;
    if (dayDelta !== 0) {
      return dayDelta;
    }

    const startDelta = a.startMinutes - b.startMinutes;
    if (startDelta !== 0) {
      return startDelta;
    }

    const taskA = a.kind === "reading" ? a.label : config.tasks[a.taskIndex]?.name || "";
    const taskB = b.kind === "reading" ? b.label : config.tasks[b.taskIndex]?.name || "";
    return taskA.localeCompare(taskB);
  });
}

function getScheduledPlacements(config) {
  return [...getReadingPlacements(config), ...state.placements];
}

function getReadingPlacements(config) {
  const firstEnabledDay = config.days.find((day) => day.enabled);
  if (!firstEnabledDay) {
    return [];
  }

  const baseSegments = getBaseWorkingSegments(firstEnabledDay, { skipFirstBreakBuffer: true });
  if (baseSegments.length === 0) {
    return [];
  }

  const readingLabel = "Reading";
  let remainingMinutes = getReadingMinutes(config.timingType);
  const placements = [];

  for (const segment of baseSegments) {
    if (remainingMinutes <= 0) {
      break;
    }

    const usedMinutes = Math.min(segment.end - segment.start, remainingMinutes);
    placements.push({
      kind: "reading",
      label: readingLabel,
      dayIndex: firstEnabledDay.index,
      startMinutes: segment.start,
      endMinutes: segment.start + usedMinutes,
    });
    remainingMinutes -= usedMinutes;
  }

  return placements;
}

function getReadingMinutes(timingType) {
  return timingType === "extra" ? Math.round(READING_MINUTES * 1.25) : READING_MINUTES;
}

function getIntroBlockedUntil(day, config) {
  const firstEnabledDay = config.days.find((candidate) => candidate.enabled);
  if (!firstEnabledDay || firstEnabledDay.index !== day.index) {
    return null;
  }

  const readingPlacements = getReadingPlacements(config);
  if (readingPlacements.length === 0) {
    return null;
  }

  const readingEnd = Math.max(...readingPlacements.map((placement) => placement.endMinutes));
  const firstBreakEnd = BREAKS[0].end;
  return readingEnd < firstBreakEnd ? firstBreakEnd : readingEnd;
}

function getWorkingSegments(day, config = null) {
  const firstEnabledDayIndex = config ? config.days.find((candidate) => candidate.enabled)?.index : null;
  const isFirstEnabledDay = firstEnabledDayIndex === day.index;
  let segments = getBaseWorkingSegments(day, { skipFirstBreakBuffer: isFirstEnabledDay });

  if (!config) {
    return segments;
  }

  const blockedUntil = getIntroBlockedUntil(day, config);
  if (!blockedUntil) {
    return segments;
  }

  return segments
    .map((segment) => ({
      start: Math.max(segment.start, blockedUntil),
      end: segment.end,
    }))
    .filter((segment) => segment.end > segment.start);
}

function getBaseWorkingSegments(day, options = {}) {
  if (!day.enabled) {
    return [];
  }

  let segments = [{ start: day.startMinutes, end: day.endMinutes }];

  BREAKS.forEach((breakSlot) => {
    segments = segments.flatMap((segment) => subtractSegment(segment, breakSlot));
  });

  return applySegmentBuffers(day, segments, options);
}

function applySegmentBuffers(day, segments, options = {}) {
  const { skipFirstBreakBuffer = false } = options;

  return segments
    .map((segment) => {
      const needsBuffer =
        segment.start === day.startMinutes ||
        !(skipFirstBreakBuffer && segment.start === BREAKS[0].end);

      return {
        start: needsBuffer ? Math.min(segment.end, segment.start + BUFFER_MINUTES) : segment.start,
        end: segment.end,
      };
    })
    .filter((segment) => segment.end > segment.start);
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

function isPlacementValid(day, placement) {
  if (!day || !day.enabled) {
    return false;
  }

  const config = readForm();
  if (!config.valid) {
    return false;
  }

  return getWorkingSegments(day, config).some(
    (segment) => placement.startMinutes >= segment.start && placement.endMinutes <= segment.end,
  );
}

function renderValidation(message) {
  els.formFeedback.textContent = message;
  els.formFeedback.classList.add("is-error");
}

function updateDayTimeFromCalendar(dayIndex, field, value) {
  const daySetting = state.daySettings[dayIndex % DAYS.length];
  if (!daySetting) {
    return;
  }

  daySetting.enabled = true;

  if (field === "start") {
    daySetting.start = value;
  }

  if (field === "end") {
    daySetting.end = value;
  }

  refreshCalendar();
}

function updateDayEnabledFromCalendar(dayIndex, enabled) {
  const daySetting = state.daySettings[dayIndex % DAYS.length];
  if (!daySetting) {
    return;
  }

  daySetting.enabled = enabled;
  refreshCalendar();
}

function updateDayBankHoliday(dayIndex, enabled) {
  if (enabled) {
    state.bankHolidayIndexes.add(dayIndex);
  } else {
    state.bankHolidayIndexes.delete(dayIndex);
  }

  refreshCalendar();
}

function getSelectedTaskIndex() {
  const selected = document.querySelector('input[name="selectedTask"]:checked');
  return selected ? Number(selected.value) : null;
}

function buildDayOrder(startIndex, totalDays) {
  const order = [];

  for (let i = startIndex; i < totalDays; i += 1) {
    order.push(i);
  }

  return order;
}

function renderSummaryChip(text) {
  const chip = document.createElement("div");
  chip.className = "summary-chip";
  chip.textContent = text;
  return chip;
}

function getExamTaskNames(examType) {
  return EXAM_TASKS[examType] || EXAM_TASKS.ESP;
}

function getExamDefaultHours(examType, timingType) {
  const minutes = getExamDefaultMinutes(examType, timingType);
  return minutes.map((value) => formatHoursInput(value));
}

function getExamDefaultMinutes(examType, timingType) {
  const base = EXAM_TASK_MINUTES[examType] || EXAM_TASK_MINUTES.ESP;
  const exempt = EXAM_EXTRA_EXEMPT_MINUTES[examType] || EXAM_EXTRA_EXEMPT_MINUTES.ESP;

  if (timingType !== "extra") {
    return base;
  }

  return base.map((minutes, index) => {
    const exemptMinutes = exempt[index] || 0;
    const extendableMinutes = Math.max(0, minutes - exemptMinutes);
    return Math.round(extendableMinutes * 1.25 + exemptMinutes);
  });
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

function addPlannerDays(dateString, plannerDayIndex) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekOffset = Math.floor(plannerDayIndex / DAYS.length) * 7;
  const dayOffset = plannerDayIndex % DAYS.length;
  date.setDate(date.getDate() + weekOffset + dayOffset);
  return formatDateInput(date);
}

function formatDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function formatLongDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
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

function formatHoursInput(totalMinutes) {
  const hours = totalMinutes / 60;
  return Number(hours.toFixed(2)).toString();
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

function capitalise(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isCompleteTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
