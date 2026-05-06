import {
    isSplitActive, activeLessonId, plannerData, currentYear, currentWeek, activeDayIndex,
    setIsSplitActive
} from './state.js';
import { saveData } from './persistence.js';
import { setSplitView } from './render.js';

export function updateClock() {
    const now = new Date();
    const display = document.getElementById('digital-clock');
    if (display) {
        display.innerText =
            now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');
    }
}

export function toggleSidebar() {
    const container = document.getElementById('view-day-detail');
    container.classList.toggle('sidebar-hidden');
}

export function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

let toolbarVisible = false;

export function toggleBottomToolbar() {
    toolbarVisible = !toolbarVisible;
    const toolbar = document.getElementById('bottom-toolbar');
    const btn     = document.getElementById('toolbar-toggle-btn');
    if (toolbarVisible) {
        toolbar.style.display = 'flex';
        btn.innerHTML = '✕';
        btn.style.bottom = '92px';
        btn.style.transform = 'rotate(90deg)';
        btn.classList.add('!bg-[#a6857e]', '!text-white', '!border-[#a6857e]');
    } else {
        toolbar.style.display = 'none';
        btn.innerHTML = '🛠️';
        btn.style.bottom = '24px';
        btn.style.transform = 'rotate(0deg)';
        btn.classList.remove('!bg-[#a6857e]', '!text-white', '!border-[#a6857e]');
    }
}

export function updateFontSize(val) {
    const el = document.getElementById('sb-plan');
    if (el) el.style.fontSize = val + 'px';
    const elRight = document.getElementById('sb-plan-right');
    if (elRight) elRight.style.fontSize = val + 'px';
}

export function toggleSplit() {
    const next = !isSplitActive;
    setIsSplitActive(next);
    setSplitView(next);
    if (activeLessonId) {
        const weekKey = `${currentYear}-W${currentWeek}`;
        const lesson = (plannerData[weekKey].lessons[activeDayIndex] || [])
            .find(l => l.id === activeLessonId);
        if (lesson) { lesson.split = next; saveData(); }
    }
}

export function toggleSettingsMenu() {
    const menu = document.getElementById('settings-menu');
    const btn  = document.getElementById('settings-btn');
    if (!menu) return;
    const isHidden = menu.classList.toggle('hidden');
    if (btn) btn.classList.toggle('active', !isHidden);
}
