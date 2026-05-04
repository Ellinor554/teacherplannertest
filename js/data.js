import {
    plannerData, currentWeek, currentYear,
    setPlannerData, setActiveLessonId
} from './state.js';
import { getSortableTime, checkIsPlanned } from './utils.js';

export function getLessons(weekKey) {
    const entry = plannerData[weekKey];
    if (!entry) return null;
    if (Array.isArray(entry)) return entry;
    if (Array.isArray(entry.lessons)) return entry.lessons;
    return null;
}

export function weekHasLessons(weekKey) {
    const lessons = getLessons(weekKey);
    return lessons && lessons.some(day => Array.isArray(day) && day.length > 0);
}

export function weekHasCustomContent(weekKey) {
    const lessons = getLessons(weekKey);
    if (!lessons) return false;
    return lessons.some(day =>
        Array.isArray(day) && day.some(lesson => checkIsPlanned(lesson.plan))
    );
}

export function migrateData() {
    Object.keys(plannerData).forEach(key => {
        const val = plannerData[key];
        if (Array.isArray(val)) {
            plannerData[key] = { lessons: val, dayNotes: ['', '', '', '', ''] };
        } else if (val && !val.lessons) {
            plannerData[key] = { lessons: [[], [], [], [], []], dayNotes: ['', '', '', '', ''] };
        }
    });
}

export function sortPlannerData(weekKey, dayIdx) {
    if (plannerData[weekKey] && plannerData[weekKey].lessons && plannerData[weekKey].lessons[dayIdx]) {
        plannerData[weekKey].lessons[dayIdx].sort(
            (a, b) => getSortableTime(a.time).localeCompare(getSortableTime(b.time))
        );
    }
}

export function copySchedule(sourceKey, targetKey) {
    const sourceLessons = getLessons(sourceKey) || [[], [], [], [], []];
    const existing = plannerData[targetKey];
    const existingNotes = (existing && existing.dayNotes) ? existing.dayNotes : ['', '', '', '', ''];
    plannerData[targetKey] = { lessons: [[], [], [], [], []], dayNotes: existingNotes };
    sourceLessons.forEach((dayLessons, idx) => {
        if (!Array.isArray(dayLessons)) return;
        dayLessons.forEach(lesson => {
            plannerData[targetKey].lessons[idx].push({
                id: Date.now() + Math.random(),
                subject: lesson.subject,
                time: lesson.time,
                plan: ''
            });
        });
    });
}

export function ensureWeekExists() {
    const weekKey = `${currentYear}-W${currentWeek}`;
    if (weekHasLessons(weekKey)) return;
    let sourceKey = null;
    for (let i = 1; i <= 52; i++) {
        let prevW = currentWeek - i;
        let prevY = currentYear;
        while (prevW < 1) { prevW += 52; prevY--; }
        const candidate = `${prevY}-W${prevW}`;
        if (weekHasLessons(candidate)) {
            sourceKey = candidate;
            break;
        }
    }
    if (sourceKey) {
        copySchedule(sourceKey, weekKey);
        plannerData[weekKey]._copiedFrom = sourceKey;
    } else {
        plannerData[weekKey] = { lessons: [[], [], [], [], []], dayNotes: ['', '', '', '', ''] };
    }
}

export function propagateToFutureWeeks(sourceKey) {
    for (let i = 1; i <= 52; i++) {
        let futureW = currentWeek + i;
        let futureY = currentYear;
        if (futureW > 52) { futureW -= 52; futureY++; }
        const futureKey = `${futureY}-W${futureW}`;
        if (weekHasCustomContent(futureKey)) continue;
        copySchedule(sourceKey, futureKey);
        plannerData[futureKey]._copiedFrom = sourceKey;
    }
}
