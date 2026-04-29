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
  comparePlacements: {
    standard: [],
    extra: [],
  },
  daySettings: [],
  bankHolidayIndexes: new Set(),
  blockedLateStayKeys: new Set(),
  presentationDayIndex: null,
};

const els = {
  form: document.querySelector("#planner-form"),
  timingType: document.querySelector("#timing-type"),
  compareMode: document.querySelector("#compare-mode"),
  weekStart: document.querySelector("#week-start"),
  examType: document.querySelector("#exam-type"),
  taskList: document.querySelector("#task-list"),
  autoPlaceButton: document.querySelector("#auto-place-button"),
  clearButton: document.querySelector("#clear-button"),
  downloadButton: document.querySelector("#download-button"),
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
  syncModeControls();
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
  els.autoPlaceButton.addEventListener("click", handleAutoPlaceAll);
  els.clearButton.addEventListener("click", handleClearCalendar);
  els.downloadButton.addEventListener("click", handleDownloadSchedule);
  els.examType.addEventListener("change", handleExamTypeChange);
  els.timingType.addEventListener("change", handleExamTypeChange);
  els.compareMode.addEventListener("change", handleCompareModeChange);
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
  const timingType = els.compareMode.checked ? "standard" : els.timingType.value;
  const durations = getExamDefaultHours(els.examType.value, timingType);

  Array.from(els.taskList.children).forEach((node, index) => {
    node.querySelector(".task-name").value = taskNames[index];
    node.querySelector(".task-hours").value = String(durations[index]);
  });

  state.placements = [];
  state.comparePlacements.standard = [];
  state.comparePlacements.extra = [];
  state.blockedLateStayKeys.clear();
  refreshCalendar();
}

function handleCompareModeChange() {
  if (els.compareMode.checked && els.timingType.value === "extra") {
    els.timingType.value = "standard";
    const taskNames = getExamTaskNames(els.examType.value);
    const durations = getExamDefaultHours(els.examType.value, "standard");
    Array.from(els.taskList.children).forEach((node, index) => {
      node.querySelector(".task-name").value = taskNames[index];
      node.querySelector(".task-hours").value = String(durations[index]);
    });
  }

  state.placements = [];
  state.comparePlacements.standard = [];
  state.comparePlacements.extra = [];
  state.blockedLateStayKeys.clear();
  syncModeControls();
  refreshCalendar();
}

function handlePlaceSelectedTask() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  if (config.compareMode) {
    renderValidation("Use Auto place all when compare mode is on.");
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

  if (config.compareMode) {
    handleCompareAutoPlaceAll(config);
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

    const result = placeTask(config, taskIndex, nextStartDayIndex, state.placements);
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
  state.comparePlacements.standard = [];
  state.comparePlacements.extra = [];
  state.blockedLateStayKeys.clear();
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendars(config, "Calendars cleared.");
}

function handleDownloadSchedule() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  renderCalendars(config, "Schedule downloaded.");
  renderPrintSheet(config);
  downloadWordSchedule(config);
}

function refreshCalendar() {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  if (config.compareMode) {
    const standardScenario = getScenarioConfig(config, "standard");
    const extraScenario = getScenarioConfig(config, "extra");
    state.comparePlacements.standard = filterValidPlacements(state.comparePlacements.standard, standardScenario);
    state.comparePlacements.extra = filterValidPlacements(state.comparePlacements.extra, extraScenario);
    renderCalendars(config, "Calendars refreshed.");
    return;
  }

  state.placements = filterValidPlacements(state.placements, config);

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
    const isPresentationDay = state.presentationDayIndex === index;
    const baseEnabled = weekday.enabled && !isBankHoliday;

    return {
      index,
      weekdayIndex,
      name: weekday.name,
      date: addPlannerDays(els.weekStart.value, index),
      enabled: baseEnabled && !isPresentationDay,
      baseEnabled,
      start: weekday.start,
      end: weekday.end,
      startMinutes: weekday.startMinutes,
      endMinutes: weekday.endMinutes,
      weekIndex: Math.floor(index / DAYS.length),
      isBankHoliday,
      isPresentationDay,
    };
  });

  const baseTasks = Array.from(els.taskList.children).map((node, index) => ({
    index,
    name: node.querySelector(".task-name").value.trim(),
    minutes: Math.round((Number(node.querySelector(".task-hours").value) || 0) * 60),
  }));

  return {
    valid: true,
    compareMode: els.compareMode.checked,
    timingType: els.timingType.value,
    examType: els.examType.value,
    weekStart: els.weekStart.value,
    days,
    baseTasks,
    tasks: baseTasks,
    presentationDayIndex: state.presentationDayIndex,
  };
}

function handleCompareAutoPlaceAll(config) {
  const standardScenario = getScenarioConfig(config, "standard");
  const extraScenario = getScenarioConfig(config, "extra");
  state.comparePlacements.standard = [];
  state.comparePlacements.extra = [];
  let nextStartDayIndex = 0;
  let message = "Standard and extra calendars placed across the four-week timetable.";

  for (let taskIndex = 0; taskIndex < config.baseTasks.length; taskIndex += 1) {
    const baseTask = config.baseTasks[taskIndex];
    if (!baseTask.name || baseTask.minutes <= 0) {
      continue;
    }

    const standardResult = placeTask(standardScenario, taskIndex, nextStartDayIndex, state.comparePlacements.standard);
    const extraResult = placeTask(extraScenario, taskIndex, nextStartDayIndex, state.comparePlacements.extra);
    const lastDayIndex = Math.max(
      getTaskLastDayIndex(state.comparePlacements.standard, taskIndex),
      getTaskLastDayIndex(state.comparePlacements.extra, taskIndex),
    );

    if (lastDayIndex >= 0) {
      nextStartDayIndex = lastDayIndex + 1;
    }

    if (standardResult.remainingMinutes > 0 || extraResult.remainingMinutes > 0) {
      message = `${baseTask.name} could not fully fit for both timing groups.`;
      break;
    }
  }

  renderCalendars(config, message);
}

function placeTask(config, taskIndex, startDayIndex, placements = state.placements) {
  const task = config.tasks[taskIndex];

  if (!task || !task.name || task.minutes <= 0) {
    return { remainingMinutes: 0, message: "Enter a task name and a length before placing it." };
  }

  removeTaskPlacements(placements, taskIndex);

  let remainingMinutes = task.minutes;
  const dayOrder = buildDayOrder(startDayIndex, config.days.length);

  for (const dayIndex of dayOrder) {
    const day = config.days[dayIndex];
    if (!day.enabled || remainingMinutes <= 0) {
      continue;
    }

    const freeSegments = getFreeSegments(day, dayIndex, config, placements);

    for (const segment of freeSegments) {
      if (remainingMinutes <= 0) {
        break;
      }

      const usedMinutes = Math.min(segment.end - segment.start, remainingMinutes);
      placements.push({
        taskIndex,
        dayIndex,
        startMinutes: segment.start,
        endMinutes: segment.start + usedMinutes,
      });
      remainingMinutes -= usedMinutes;
    }

    if (canUseLateStay(config, day, dayIndex, taskIndex, remainingMinutes, placements)) {
      const lateSegments = getLateStaySegments(day, dayIndex, config, placements);
      const lateCapacity = lateSegments.reduce((total, segment) => total + (segment.end - segment.start), 0);

      if (lateCapacity >= remainingMinutes) {
        for (const segment of lateSegments) {
          if (remainingMinutes <= 0) {
            break;
          }

          const usedMinutes = Math.min(segment.end - segment.start, remainingMinutes);
          placements.push({
            taskIndex,
            dayIndex,
            startMinutes: segment.start,
            endMinutes: segment.start + usedMinutes,
            lateStay: true,
          });
          remainingMinutes -= usedMinutes;
        }
      }
    }
  }

  if (remainingMinutes > 0) {
    return { remainingMinutes, message: `${task.name} did not fully fit into the four-week timetable.` };
  }

  return { remainingMinutes: 0, message: `${task.name} placed into the calendars.` };
}

function getFreeSegments(day, dayIndex, config, placements = state.placements) {
  const workingSegments = getWorkingSegments(day, config);
  const dayPlacements = [...getFixedPlacements(config), ...placements]
    .filter((placement) => placement.dayIndex === dayIndex)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return subtractPlacementsFromSegments(workingSegments, dayPlacements);
}

function getFixedPlacements(config) {
  return [...getReadingPlacements(config)];
}

function canUseLateStay(config, day, dayIndex, taskIndex, remainingMinutes, placements) {
  if (config.timingType !== "extra") {
    return false;
  }

  if (remainingMinutes <= 0 || remainingMinutes > 60) {
    return false;
  }

  if (day.endMinutes >= DAY_END) {
    return false;
  }

  if (state.blockedLateStayKeys.has(getLateStayKey(config.timingType, taskIndex, dayIndex))) {
    return false;
  }

  return placements.some((placement) => placement.taskIndex === taskIndex && placement.dayIndex === dayIndex);
}

function getLateStaySegments(day, dayIndex, config, placements) {
  const extendedDay = {
    ...day,
    end: fromMinutes(DAY_END),
    endMinutes: DAY_END,
  };

  const workingSegments = getWorkingSegments(extendedDay, config)
    .map((segment) => ({
      start: Math.max(segment.start, day.endMinutes),
      end: segment.end,
    }))
    .filter((segment) => segment.end > segment.start);

  const dayPlacements = placements
    .filter((placement) => placement.dayIndex === dayIndex)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  return subtractPlacementsFromSegments(workingSegments, dayPlacements);
}

function removeTaskPlacements(placements, taskIndex) {
  const nextPlacements = placements.filter((placement) => placement.taskIndex !== taskIndex);
  placements.length = 0;
  placements.push(...nextPlacements);
}

function getTaskLastDayIndex(placements, taskIndex) {
  const placementDays = placements.filter((placement) => placement.taskIndex === taskIndex).map((placement) => placement.dayIndex);
  return placementDays.length > 0 ? Math.max(...placementDays) : -1;
}

function filterValidPlacements(placements, config) {
  return placements.filter((placement) => {
    const task = config.tasks[placement.taskIndex];
    const day = config.days[placement.dayIndex];
    return task && task.name && task.minutes > 0 && isPlacementValid(day, placement, config);
  });
}

function getScenarioConfig(config, timingType) {
  return {
    ...config,
    timingType,
    tasks: getScenarioTasks(config.baseTasks, config.examType, timingType),
  };
}

function getScenarioTasks(baseTasks, examType, timingType) {
  return baseTasks.map((task, index) => ({
    ...task,
    minutes: timingType === "extra" ? getAdjustedMinutes(task.minutes, examType, index) : task.minutes,
  }));
}

function getAdjustedMinutes(baseMinutes, examType, taskIndex) {
  const exemptMinutes = (EXAM_EXTRA_EXEMPT_MINUTES[examType] || EXAM_EXTRA_EXEMPT_MINUTES.ESP)[taskIndex] || 0;
  const extendableMinutes = Math.max(0, baseMinutes - exemptMinutes);
  return Math.round(extendableMinutes * 1.25 + exemptMinutes);
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
  const scenarios = getRenderScenarios(config);
  const heading = document.createElement("div");
  heading.className = "print-heading";
  const bankHolidays = config.days.filter((day) => day.isBankHoliday).map((day) => `${day.name} ${formatLongDate(day.date)}`);
  const presentationDay = state.presentationDayIndex === null ? null : config.days[state.presentationDayIndex];
  heading.innerHTML = `
    <h2>TLV Exam Calendar</h2>
    <div class="print-meta">
      <span>Exam: ${escapeHtml(config.examType)}</span>
      <span>View: ${escapeHtml(config.compareMode ? "Compare" : capitalise(config.timingType))}</span>
      <span>Start week: ${escapeHtml(formatLongDate(config.weekStart))}</span>
      <span>Weeks: ${WEEKS}</span>
    </div>
  `;
  const overview = document.createElement("div");
  overview.className = "print-overview";
  if (config.compareMode) {
    overview.innerHTML = `
      <div class="print-note">Show both calendars: Standard and Extra start each task together. A new task begins only after both groups finish the previous task.</div>
    `;
  }
  if (bankHolidays.length > 0) {
    const holidayNote = document.createElement("div");
    holidayNote.className = "print-note";
    holidayNote.textContent = `Bank holidays: ${bankHolidays.join(", ")}`;
    overview.append(holidayNote);
  }
  if (presentationDay) {
    const presentationNote = document.createElement("div");
    presentationNote.className = "print-note";
    presentationNote.textContent = `Presentation day: ${presentationDay.name} ${formatLongDate(presentationDay.date)}`;
    overview.append(presentationNote);
  }

  const sections = scenarios.map((scenario) => renderPrintScenarioSection(scenario, config.compareMode));
  printSheet.replaceChildren(heading, overview, ...sections);
}

function renderPrintScenarioSection(scenario, showGroupTitle) {
  const section = document.createElement("section");
  section.className = "print-scenario";

  const placements = getSortedPlacements(scenario);
  const totals = document.createElement("div");
  totals.className = "print-scenario-meta";
  const totalTaskMinutes = scenario.tasks.reduce((total, task) => total + (task.name ? task.minutes : 0), 0);
  const totalPlacedMinutes = getPlacementStore(scenario, scenario.timingType).reduce(
    (total, placement) => total + (placement.endMinutes - placement.startMinutes),
    0,
  );

  if (showGroupTitle) {
    const title = document.createElement("h3");
    title.className = "print-scenario-title";
    title.textContent = capitalise(scenario.timingType);
    section.append(title);
  }

  totals.innerHTML = `
    <span>Tasks: ${escapeHtml(formatMinutes(totalTaskMinutes))}</span>
    <span>Placed: ${escapeHtml(formatMinutes(totalPlacedMinutes))}</span>
  `;
  section.append(totals);

  const table = document.createElement("table");
  table.className = "print-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Task</th>
        <th>Week</th>
        <th>Day</th>
        <th>Date</th>
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
    let previousTaskLabel = "";
    placements.forEach((placement) => {
      const day = scenario.days[placement.dayIndex];
      const taskLabel = getPlacementLabel(placement, scenario);

      if (taskLabel !== previousTaskLabel) {
        const groupRow = document.createElement("tr");
        groupRow.className = "print-task-group";
        groupRow.innerHTML = `<td colspan="7">${escapeHtml(taskLabel)}</td>`;
        tbody.append(groupRow);
        previousTaskLabel = taskLabel;
      }

      const row = document.createElement("tr");
      if (placement.lateStay) {
        row.className = "print-late-stay-row";
      }
      row.innerHTML = `
        <td>${escapeHtml(placement.lateStay ? `${taskLabel} (Late stay)` : taskLabel)}</td>
        <td>Week ${day.weekIndex + 1}</td>
        <td>${escapeHtml(day.name)}</td>
        <td>${escapeHtml(formatLongDate(day.date))}</td>
        <td>${escapeHtml(fromMinutes(placement.startMinutes))}</td>
        <td>${escapeHtml(fromMinutes(placement.endMinutes))}</td>
        <td>${escapeHtml(formatMinutes(placement.endMinutes - placement.startMinutes))}</td>
      `;
      tbody.append(row);
    });
  }

  table.append(tbody);
  section.append(table);
  return section;
}

function downloadWordSchedule(config) {
  const documentHtml = buildWordDocument(config);
  const blob = new Blob([`\ufeff${documentHtml}`], {
    type: "application/msword",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const weekLabel = config.weekStart.replaceAll("-", "");
  link.href = downloadUrl;
  link.download = `TLV-Exam-Schedule-${config.examType}-${weekLabel}.doc`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

function buildWordDocument(config) {
  const title = "TLV Exam Calendar";
  const stylesheet = `
    body {
      font-family: Arial, sans-serif;
      color: #0f172a;
      margin: 18px;
    }

    h1,
    h2,
    h3 {
      margin: 0;
    }

    .print-sheet {
      display: block;
    }

    .print-heading {
      display: block;
      margin-bottom: 18px;
    }

    .print-heading h2 {
      margin-bottom: 10px;
      font-size: 22px;
    }

    .print-meta,
    .print-scenario-meta {
      display: block;
      margin-bottom: 8px;
      color: #475569;
      font-size: 13px;
      font-weight: 700;
    }

    .print-meta span,
    .print-scenario-meta span {
      display: inline-block;
      margin-right: 16px;
      margin-bottom: 6px;
    }

    .print-overview {
      margin-bottom: 18px;
    }

    .print-note {
      margin-bottom: 8px;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #f8fafc;
      color: #334155;
      font-size: 13px;
      line-height: 1.35;
    }

    .print-scenario {
      margin-bottom: 22px;
    }

    .print-scenario-title {
      margin-bottom: 10px;
      font-size: 18px;
      color: #1d4ed8;
    }

    .print-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }

    .print-table th,
    .print-table td {
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
      text-align: left;
      vertical-align: top;
      word-wrap: break-word;
    }

    .print-table th {
      background: #e2e8f0;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .print-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .print-task-group td {
      background: #eaf2ff;
      color: #1e3a8a;
      font-weight: 800;
      border-top-width: 2px;
    }

    .print-late-stay-row td {
      background: #fff7ed;
      color: #9a3412;
    }
  `;

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Word.Document" />
    <meta name="Generator" content="TLV Exam Calendar" />
    <title>${escapeHtml(title)}</title>
    <style>${stylesheet}</style>
  </head>
  <body>
    <div class="print-sheet">
      ${els.printSheet.innerHTML}
    </div>
  </body>
</html>`;
}

function renderSummary(config) {
  const totalCapacity = config.days.reduce(
    (total, day) => total + getWorkingSegments(day, config).reduce((sum, segment) => sum + (segment.end - segment.start), 0),
    0,
  );
  const scenarios = getRenderScenarios(config);
  const chips = [`Exam: ${config.examType}`, `Weeks: ${WEEKS}`, `Available per calendar: ${formatMinutes(totalCapacity)}`];

  scenarios.forEach((scenario) => {
    const totalTaskMinutes = scenario.tasks.reduce((total, task) => total + (task.name ? task.minutes : 0), 0);
    const placedMinutes = getPlacementStore(config, scenario.timingType).reduce(
      (total, placement) => total + (placement.endMinutes - placement.startMinutes),
      0,
    );
    chips.push(`${capitalise(scenario.timingType)} tasks: ${formatMinutes(totalTaskMinutes)}`);
    chips.push(`${capitalise(scenario.timingType)} placed: ${formatMinutes(placedMinutes)}`);
  });

  els.summaryStrip.replaceChildren(...chips.map(renderSummaryChip));
}

function renderWeeks(config) {
  const weekNodes = [];
  const scenarios = getRenderScenarios(config);

  for (let weekIndex = 0; weekIndex < WEEKS; weekIndex += 1) {
    const weekNode = els.weekTemplate.content.firstElementChild.cloneNode(true);
    const weekDays = config.days.slice(weekIndex * DAYS.length, (weekIndex + 1) * DAYS.length);
    weekNode.querySelector(".week-label").textContent = `Week ${weekIndex + 1}`;
    weekNode.querySelector(".week-range").textContent = `${formatDate(weekDays[0].date)} to ${formatDate(weekDays[weekDays.length - 1].date)}`;
    const shell = weekNode.querySelector(".calendar-shell");
    shell.classList.toggle("compare-shell", config.compareMode);
    const groups = scenarios.map((scenario) => renderScenarioGroup(weekDays, scenario));
    shell.replaceChildren(...groups);
    weekNodes.push(weekNode);
  }

  els.weeksStack.replaceChildren(...weekNodes);
}

function renderScenarioGroup(weekDays, scenario) {
  const group = document.createElement("section");
  group.className = "scenario-group";
  group.dataset.timing = scenario.timingType;
  const heading = document.createElement("div");
  heading.className = "scenario-heading";
  heading.textContent = capitalise(scenario.timingType);
  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  grid.replaceChildren(...weekDays.map((day) => renderDay(day, scenario)));
  group.append(heading, grid);
  return group;
}

function renderDay(day, config) {
  const node = els.dayColumnTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("day-offsite", !day.enabled);
  node.classList.toggle("day-collapsed", config.compareMode && !day.enabled);
  node.querySelector(".calendar-day-name").textContent = day.name;
  node.querySelector(".calendar-day-date").textContent = formatDate(day.date);

  const enabledInput = node.querySelector(".calendar-day-enabled");
  const bankHolidayToggle = node.querySelector(".bank-holiday-toggle");
  const bankHolidayInput = node.querySelector(".calendar-day-bank-holiday");
  const presentationToggle = node.querySelector(".presentation-toggle");
  const presentationInput = node.querySelector(".calendar-day-presentation");
  const startInput = node.querySelector(".calendar-day-start");
  const endInput = node.querySelector(".calendar-day-end");
  const isMonday = day.name === "Monday";
  enabledInput.checked = day.enabled;
  bankHolidayInput.checked = day.isBankHoliday;
  presentationInput.checked = day.isPresentationDay;
  bankHolidayToggle.classList.toggle("is-hidden", !isMonday);
  presentationInput.disabled = !day.baseEnabled && !day.isPresentationDay;
  startInput.value = day.start || "09:00";
  endInput.value = day.end || "16:30";
  startInput.disabled = !day.enabled;
  endInput.disabled = !day.enabled;
  enabledInput.addEventListener("change", () => updateDayEnabledFromCalendar(day.index, enabledInput.checked));
  bankHolidayInput.addEventListener("change", () => updateDayBankHoliday(day.index, bankHolidayInput.checked));
  presentationInput.addEventListener("change", () => updatePresentationDay(day.index, presentationInput.checked));
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
    offsite.textContent = day.isBankHoliday ? "Bank holiday" : day.isPresentationDay ? "Presentation" : "Not in";
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
    session.className = `session-block${isReading ? " reading-session" : ""}${placement.lateStay ? " late-stay-session" : ""}`;
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
    if (placement.lateStay) {
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "late-stay-dismiss";
      dismissButton.setAttribute("aria-label", `Do not use late stay for ${task.name} on ${day.name}`);
      dismissButton.textContent = "×";
      dismissButton.addEventListener("click", () => blockLateStayAndReflow(config, placement.taskIndex, day.index));
      session.append(dismissButton);
    }
    sessionLayer.append(session);
  });

  return node;
}

function renderWarning(config) {
  const warnings = [];
  getRenderScenarios(config).forEach((scenario) => {
    scenario.tasks.forEach((task) => {
      if (!task.name || task.minutes <= 0) {
        return;
      }

      const placedMinutes = getPlacementStore(config, scenario.timingType)
        .filter((placement) => placement.taskIndex === task.index)
        .reduce((total, placement) => total + (placement.endMinutes - placement.startMinutes), 0);

      if (placedMinutes < task.minutes) {
        warnings.push(`${capitalise(scenario.timingType)} ${task.name} has ${formatMinutes(task.minutes - placedMinutes)} still unplaced`);
      }
    });
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

    const taskA = getPlacementLabel(a, config);
    const taskB = getPlacementLabel(b, config);
    return taskA.localeCompare(taskB);
  });
}

function getPlacementLabel(placement, config) {
  if (placement.kind === "reading") {
    return placement.label;
  }

  return config.tasks[placement.taskIndex]?.name || "";
}

function getScheduledPlacements(config) {
  return [...getReadingPlacements(config), ...getPlacementStore(config, config.timingType)];
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

function getRenderScenarios(config) {
  return config.compareMode ? [getScenarioConfig(config, "standard"), getScenarioConfig(config, "extra")] : [config];
}

function getPlacementStore(config, timingType) {
  if (config.compareMode) {
    return state.comparePlacements[timingType] || [];
  }

  return state.placements;
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
    start: breakSlot.start,
    end: breakSlot.end,
    label: breakSlot.label,
  }));
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

function isPlacementValid(day, placement, config = readForm()) {
  if (!day || !day.enabled) {
    return false;
  }

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
    if (state.presentationDayIndex === dayIndex) {
      state.presentationDayIndex = null;
    }
  } else {
    state.bankHolidayIndexes.delete(dayIndex);
  }

  reflowIfNeeded("Day updated.");
}

function updatePresentationDay(dayIndex, enabled) {
  if (enabled) {
    state.presentationDayIndex = dayIndex;
  } else if (state.presentationDayIndex === dayIndex) {
    state.presentationDayIndex = null;
  }

  reflowIfNeeded("Presentation day updated.");
}

function blockLateStayAndReflow(config, taskIndex, dayIndex) {
  state.blockedLateStayKeys.add(getLateStayKey(config.timingType, taskIndex, dayIndex));
  reflowIfNeeded("Late stay removed and calendars reflowed.");
}

function reflowIfNeeded(message) {
  const config = readForm();
  if (!config.valid) {
    renderValidation(config.message);
    return;
  }

  const hasPlacements =
    state.placements.length > 0 ||
    state.comparePlacements.standard.length > 0 ||
    state.comparePlacements.extra.length > 0;

  if (!hasPlacements) {
    renderCalendars(config, message);
    return;
  }

  if (config.compareMode) {
    handleCompareAutoPlaceAll(config);
    els.formFeedback.textContent = message;
    return;
  }

  state.placements = [];
  let nextStartDayIndex = 0;
  let reflowMessage = message;

  for (let taskIndex = 0; taskIndex < config.tasks.length; taskIndex += 1) {
    const task = config.tasks[taskIndex];
    if (!task.name || task.minutes <= 0) {
      continue;
    }

    const result = placeTask(config, taskIndex, nextStartDayIndex, state.placements);
    const placementDays = state.placements.filter((placement) => placement.taskIndex === taskIndex).map((placement) => placement.dayIndex);
    if (placementDays.length > 0) {
      nextStartDayIndex = Math.max(...placementDays) + 1;
    }
    if (result.remainingMinutes > 0) {
      reflowMessage = `${task.name} could not fully fit into the four-week timetable.`;
      break;
    }
  }

  renderCalendars(config, reflowMessage);
}

function syncModeControls() {
  const compareMode = els.compareMode.checked;
  els.timingType.disabled = compareMode;
}

function getLateStayKey(timingType, taskIndex, dayIndex) {
  return `${timingType}:${taskIndex}:${dayIndex}`;
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
