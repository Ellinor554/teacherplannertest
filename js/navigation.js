import {
    currentWeek, currentYear, activeView,
    setCurrentWeek, setCurrentYear, setActiveView, setActiveDayIndex, setActiveLessonId
} from './state.js';
import { ensureWeekExists } from './data.js';
import { saveData } from './persistence.js';
import { renderOversikt, renderDayDetail, renderFutureWeeks } from './render.js';
import { saveAndClearLessonTools, restoreLessonTools } from './tools.js';
import { renderAcademicPlanningView } from './academicPlanning.js';

export function refreshUI() {
    document.getElementById('current-week-display').innerText = currentWeek;
    ensureWeekExists();
    saveData(); // persist any newly-initialised week data (mirrors original behaviour)
    renderOversikt();
    if (activeView === 'day-detail') renderDayDetail();
    if (activeView === 'lasarsplanering') renderAcademicPlanningView();
}

export function changeView(view) {
    setActiveView(view);

    // Save and remove lesson-specific tools before clearing the view
    saveAndClearLessonTools();

    // Remove remaining (non-lesson) floating tools
    document.querySelectorAll('.floating-tool').forEach(el => {
        if (typeof el._cleanup === 'function') el._cleanup();
        el.remove();
    });

    document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('view-oversikt').classList.add('hidden');
    document.getElementById('view-framtid').classList.add('hidden');
    document.getElementById('view-day-detail').classList.add('hidden');
    document.getElementById('view-lasarsplanering').classList.add('hidden');

    const isAcademic = view === 'lasarsplanering';
    document.getElementById('week-nav').classList.toggle('hidden', isAcademic);
    document.getElementById('academic-planning-title').classList.toggle('hidden', !isAcademic);

    if (view === 'oversikt') {
        document.getElementById('view-oversikt').classList.remove('hidden');
        document.getElementById('btn-oversikt').classList.add('active');
        renderOversikt();
    } else if (view === 'framtid') {
        document.getElementById('view-framtid').classList.remove('hidden');
        document.getElementById('btn-framtid').classList.add('active');
    } else if (view === 'lasarsplanering') {
        document.getElementById('view-lasarsplanering').classList.remove('hidden');
        document.getElementById('btn-lasarsplanering').classList.add('active');
        renderAcademicPlanningView();
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
    restoreLessonTools(dayIdx, lessonId);
}

// Used by lessons.js to refresh the detail panel without importing render.js directly
export function refreshDayDetail() {
    renderDayDetail();
}
