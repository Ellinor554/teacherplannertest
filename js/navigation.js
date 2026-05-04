import {
    currentWeek, currentYear, activeView,
    setCurrentWeek, setCurrentYear, setActiveView, setActiveDayIndex, setActiveLessonId
} from './state.js';
import { ensureWeekExists } from './data.js';
import { saveData } from './persistence.js';
import { renderOversikt, renderDayDetail, renderFutureWeeks } from './render.js';

export function refreshUI() {
    document.getElementById('current-week-display').innerText = currentWeek;
    ensureWeekExists();
    saveData(); // persist any newly-initialised week data (mirrors original behaviour)
    renderOversikt();
    if (activeView === 'day-detail') renderDayDetail();
}

export function changeView(view) {
    setActiveView(view);
    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('view-oversikt').classList.add('hidden');
    document.getElementById('view-framtid').classList.add('hidden');
    document.getElementById('view-day-detail').classList.add('hidden');

    if (view === 'oversikt') {
        document.getElementById('view-oversikt').classList.remove('hidden');
        document.getElementById('btn-oversikt').classList.add('active');
        renderOversikt();
    } else if (view === 'framtid') {
        document.getElementById('view-framtid').classList.remove('hidden');
        document.getElementById('btn-framtid').classList.add('active');
    } else {
        const dayMap = { mandag: 0, tisdag: 1, onsdag: 2, torsdag: 3, fredag: 4 };
        setActiveDayIndex(dayMap[view]);
        document.getElementById('view-day-detail').classList.remove('hidden');
        document.getElementById(`btn-${view}`).classList.add('active');
        renderDayDetail();
    }
}

export function changeWeek(delta) {
    let w = currentWeek + delta;
    let y = currentYear;
    if (w > 52) { w = 1; y++; }
    if (w < 1)  { w = 52; y--; }
    setCurrentWeek(w);
    setCurrentYear(y);
    refreshUI();
}

export function changeWeekTo(w) {
    setCurrentWeek(w);
    refreshUI();
    changeView('oversikt');
}

export function goToLesson(dayIdx, lessonId) {
    const viewName = ['mandag', 'tisdag', 'onsdag', 'torsdag', 'fredag'][dayIdx];
    setActiveLessonId(lessonId);
    changeView(viewName);
}

// Used by lessons.js to refresh the detail panel without importing render.js directly
export function refreshDayDetail() {
    renderDayDetail();
}
