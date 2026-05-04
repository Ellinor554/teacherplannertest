import {
    plannerData, currentYear, currentWeek, activeDayIndex, activeLessonId,
    setActiveLessonId
} from './state.js';
import { sortPlannerData, propagateToFutureWeeks } from './data.js';
import { saveData } from './persistence.js';
import { changeView, refreshDayDetail } from './navigation.js';
import { insertImageBlobInto } from './images.js';
import { updateNotesButtonState } from './notes.js';
import { checkIsPlanned } from './utils.js';

export function saveDayNote(dayIdx, value) {
    const weekKey = `${currentYear}-W${currentWeek}`;
    if (!plannerData[weekKey].dayNotes) plannerData[weekKey].dayNotes = ['', '', '', '', ''];
    plannerData[weekKey].dayNotes[dayIdx] = value;
    saveData();
}

export function addLessonPrompt() {
    const subject = prompt('Vad är det för ämne?');
    if (!subject) return;
    const timeInput = prompt('Vilken tid? (t.ex. 08:00 eller 14:10-14:40)', '08:00');
    if (!timeInput) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const newLesson = { id: Date.now(), subject, time: timeInput, plan: '' };
    plannerData[weekKey].lessons[activeDayIndex].push(newLesson);
    sortPlannerData(weekKey, activeDayIndex);
    propagateToFutureWeeks(weekKey);
    saveData();
    setActiveLessonId(newLesson.id);
    refreshDayDetail();
}

export function deleteLesson(id, e) {
    e.stopPropagation();
    if (!confirm('Radera lektion?')) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    plannerData[weekKey].lessons[activeDayIndex] =
        plannerData[weekKey].lessons[activeDayIndex].filter(l => l.id !== id);
    if (activeLessonId === id) setActiveLessonId(null);
    propagateToFutureWeeks(weekKey);
    saveData();
    refreshDayDetail();
}

export function handleInput() {
    if (!activeLessonId) return;
    const planContent = document.getElementById('sb-plan').innerHTML;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (lesson) {
        lesson.plan = planContent;
        if (plannerData[weekKey]._copiedFrom) delete plannerData[weekKey]._copiedFrom;
        saveData();
        const isPlanned = checkIsPlanned(planContent);
        const activeBtn = document.querySelector(`[data-id="${activeLessonId}"]`);
        if (activeBtn) {
            const title = activeBtn.querySelector('.lesson-subject-title');
            if (isPlanned) title.classList.add('is-planned');
            else title.classList.remove('is-planned');
        }
    }
}

export function handleInputRight() {
    if (!activeLessonId) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (lesson) {
        lesson.planRight = document.getElementById('sb-plan-right').innerHTML;
        saveData();
    }
}

export function handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of Object.values(items)) {
        if (item.kind === 'file' && item.type.includes('image')) {
            e.preventDefault();
            insertImageBlobInto(item.getAsFile(), document.getElementById('sb-plan'), handleInput);
        }
    }
}

export function handlePasteRight(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of Object.values(items)) {
        if (item.kind === 'file' && item.type.includes('image')) {
            e.preventDefault();
            insertImageBlobInto(item.getAsFile(), document.getElementById('sb-plan-right'), handleInputRight);
        }
    }
}

export function goToDayAndAdd(dayIdx) {
    const viewName = ['mandag', 'tisdag', 'onsdag', 'torsdag', 'fredag'][dayIdx];
    changeView(viewName);
    setTimeout(() => addLessonPrompt(), 100);
}
