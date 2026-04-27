const DAY_SLOTS = [
  { start: "09:00", end: "11:10" },
  { start: "11:25", end: "13:35" },
  { start: "14:20", end: "15:20" },
  { start: "15:25", end: "16:30" },
];

const MINUTES_PER_DAY = DAY_SLOTS.reduce((total, slot) => total + diffMinutes(slot.start, slot.end), 0);
const DEFAULT_PLAN_LENGTH_DAYS = 28;

const els = {
  form: document.querySelector("#planner-form"),
  studentName: document.querySelector("#student-name"),
  examOneName: document.querySelector("#exam-one-name"),
  examOneHours: document.querySelector("#exam-one-hours"),
  examTwoName: document.querySelector("#exam-two-name"),
  examTwoHours: document.querySelector("#exam-two-hours"),
  extraTime: document.querySelector("#extra-time"),
  scheduleOrder: document.querySelector("#schedule-order"),
  startDate: document.querySelector("#start-date"),
  endDate: document.querySelector("#end-date"),
  printButton: document.querySelector("#print-button"),
  formFeedback: document.querySelector("#form-feedback"),
  summaryGrid: document.querySelector("#summary-grid"),
  scheduleList: document.querySelector("#schedule-list"),
  emptyState: document.querySelector("#empty-state"),
  warningBanner: document.querySelector("#warning-banner"),
  summaryCardTemplate: document.querySelector("#summary-card-template"),
  dayCardTemplate: document.querySelector("#day-card-template"),
};

initialise();

function initialise() {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + DEFAULT_PLAN_LENGTH_DAYS);

  els.startDate.value = formatDateInput(today);
  els.endDate.value = formatDateInput(endDate);

  els.form.addEventListener("submit", handleSubmit);
  els.printButton.addEventListener("click", handlePrint);

  buildPlan();
}

function handleSubmit(event) {
  event.preventDefault();
  buildPlan();
}

function handlePrint() {
  buildPlan();
  window.print();
}

function buildPlan() {
  const config = readForm();

  if (!config.valid) {
    renderEmpty(config.message, true);
    return;
  }

  const result = createSchedule(config);
  renderSchedule(result, config);
}

function readForm() {
  const selectedWeekdays = Array.from(document.querySelectorAll('input[name="weekday"]:checked')).map((input) =>
    Number(input.value),
  );
  const exams = [
    {
      name: cleanName(els.examOneName.value, "Exam 1"),
      hours: Number(els.examOneHours.value),
    },
    {
      name: cleanName(els.examTwoName.value, "Exam 2"),
      hours: Number(els.examTwoHours.value),
    },
  ];

  if (!els.startDate.value || !els.endDate.value) {
    return invalid("Choose both a start date and an end date.");
  }

  if (selectedWeekdays.length === 0) {
    return invalid("Select at least one available day.");
  }

  if (new Date(els.endDate.value) < new Date(els.startDate.value)) {
    return invalid("The end date must be on or after the start date.");
  }

  if (exams.some((exam) => !Number.isFinite(exam.hours) || exam.hours <= 0)) {
    return invalid("Each exam needs a duration greater than zero.");
  }

  const extraTimePercent = Math.max(0, Number(els.extraTime.value) || 0);

  return {
    valid: true,
    studentName: cleanName(els.studentName.value, "Student"),
    exams,
    extraTimePercent,
    scheduleOrder: els.scheduleOrder.value,
    startDate: els.startDate.value,
    endDate: els.endDate.value,
    selectedWeekdays,
  };
}

function createSchedule(config) {
  const multiplier = 1 + config.extraTimePercent / 100;
  const orderedExams = orderExams(config.exams, config.scheduleOrder).map((exam) => ({
    ...exam,
    adjustedMinutes: Math.round(exam.hours * 60 * multiplier),
    remainingMinutes: Math.round(exam.hours * 60 * multiplier),
  }));

  const availableDates = listAvailableDates(config.startDate, config.endDate, config.selectedWeekdays);
  const days = [];

  for (const date of availableDates) {
    let remainingDayMinutes = MINUTES_PER_DAY;
    const sessions = [];

    for (const exam of orderedExams) {
      if (exam.remainingMinutes <= 0 || remainingDayMinutes <= 0) {
        continue;
      }

      for (const slot of DAY_SLOTS) {
        const slotSessions = splitSlotForExam(date, slot, exam, remainingDayMinutes, sessions);
        remainingDayMinutes -= slotSessions.usedMinutes;

        if (slotSessions.session) {
          sessions.push(slotSessions.session);
        }

        if (exam.remainingMinutes <= 0 || remainingDayMinutes <= 0) {
          break;
        }
      }
    }

    if (sessions.length > 0) {
      days.push({
        date,
        sessions,
        totalMinutes: sessions.reduce((total, session) => total + session.lengthMinutes, 0),
      });
    }
  }

  const unscheduledMinutes = orderedExams.reduce((total, exam) => total + exam.remainingMinutes, 0);
  const usedMinutes = orderedExams.reduce((total, exam) => total + (exam.adjustedMinutes - exam.remainingMinutes), 0);

  return {
    days,
    exams: orderedExams,
    unscheduledMinutes,
    usedMinutes,
    availableDayCount: availableDates.length,
    requiredDayCount: Math.ceil(
      orderedExams.reduce((total, exam) => total + exam.adjustedMinutes, 0) / MINUTES_PER_DAY,
    ),
  };
}

function splitSlotForExam(date, slot, exam, remainingDayMinutes, existingSessions) {
  if (exam.remainingMinutes <= 0 || remainingDayMinutes <= 0) {
    return { session: null, usedMinutes: 0 };
  }

  const slotStart = slot.start;
  const slotEnd = slot.end;
  const slotLength = diffMinutes(slotStart, slotEnd);
  const usedInSlot = existingSessions
    .filter((session) => session.slotStart === slot.start && session.slotEnd === slot.end)
    .reduce((total, session) => total + session.lengthMinutes, 0);
  const availableInSlot = slotLength - usedInSlot;

  if (availableInSlot <= 0) {
    return { session: null, usedMinutes: 0 };
  }

  const lengthMinutes = Math.min(exam.remainingMinutes, remainingDayMinutes, availableInSlot);
  const startMinutes = toMinutes(slotStart) + usedInSlot;
  const endMinutes = startMinutes + lengthMinutes;

  exam.remainingMinutes -= lengthMinutes;

  return {
    usedMinutes: lengthMinutes,
    session: {
      examName: exam.name,
      date,
      start: fromMinutes(startMinutes),
      end: fromMinutes(endMinutes),
      lengthMinutes,
      slotStart,
      slotEnd,
    },
  };
}

function renderSchedule(result, config) {
  const summaryCards = [
    { label: "Student", value: config.studentName },
    { label: "Extra time", value: `${config.extraTimePercent}%` },
    { label: "Available days", value: String(result.availableDayCount) },
    { label: "Days needed", value: String(result.requiredDayCount) },
    { label: "Total scheduled", value: formatMinutes(result.usedMinutes) },
  ].map(renderSummaryCard);

  els.summaryGrid.replaceChildren(...summaryCards);

  if (result.unscheduledMinutes > 0) {
    els.warningBanner.textContent =
      `Not enough time in the selected date range. ${formatMinutes(result.unscheduledMinutes)} still needs scheduling.`;
    els.warningBanner.classList.remove("is-hidden");
  } else {
    els.warningBanner.textContent = "";
    els.warningBanner.classList.add("is-hidden");
  }

  const dayCards = result.days.map((day) => renderDayCard(day));
  els.scheduleList.replaceChildren(...dayCards);
  els.emptyState.classList.toggle("is-hidden", dayCards.length > 0);

  if (dayCards.length === 0) {
    renderEmpty("No sessions fit inside the selected dates and weekdays.", false);
    return;
  }

  els.formFeedback.textContent =
    `Planned ${result.exams.length} exams across ${result.days.length} day${result.days.length === 1 ? "" : "s"}.`;
  els.formFeedback.classList.remove("is-error");
}

function renderSummaryCard(item) {
  const node = els.summaryCardTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".summary-label").textContent = item.label;
  node.querySelector(".summary-value").textContent = item.value;
  return node;
}

function renderDayCard(day) {
  const node = els.dayCardTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".day-date").textContent = formatLongDate(day.date);
  node.querySelector(".day-title").textContent = summariseDay(day.sessions);
  node.querySelector(".day-total").textContent = formatMinutes(day.totalMinutes);

  const rows = day.sessions.map((session) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(session.examName)}</td>
      <td>${session.start}</td>
      <td>${session.end}</td>
      <td>${formatMinutes(session.lengthMinutes)}</td>
    `;
    return row;
  });

  node.querySelector(".session-body").replaceChildren(...rows);
  return node;
}

function renderEmpty(message, isError) {
  els.summaryGrid.replaceChildren();
  els.scheduleList.replaceChildren();
  els.emptyState.classList.remove("is-hidden");
  els.warningBanner.classList.add("is-hidden");
  els.formFeedback.textContent = message;
  els.formFeedback.classList.toggle("is-error", isError);
}

function orderExams(exams, order) {
  if (order === "largest-first") {
    return [...exams].sort((a, b) => b.hours - a.hours);
  }

  return exams;
}

function listAvailableDates(startDate, endDate, selectedWeekdays) {
  const dates = [];
  const current = new Date(`${startDate}T12:00:00`);
  const finalDate = new Date(`${endDate}T12:00:00`);

  while (current <= finalDate) {
    if (selectedWeekdays.includes(current.getDay())) {
      dates.push(formatDateInput(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function summariseDay(sessions) {
  const uniqueExams = [...new Set(sessions.map((session) => session.examName))];
  return uniqueExams.join(" and ");
}

function formatLongDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
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

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function cleanName(value, fallback) {
  return value.trim() || fallback;
}

function invalid(message) {
  return {
    valid: false,
    message,
  };
}

function diffMinutes(start, end) {
  return toMinutes(end) - toMinutes(start);
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
