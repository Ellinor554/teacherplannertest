import { days, months } from './config.js';
import {
    plannerData, currentYear, currentWeek,
    activeDayIndex, activeLessonId, setActiveLessonId
} from './state.js';
import { getSubjectColor, getMonday, checkIsPlanned } from './utils.js';
import { sortPlannerData } from './data.js';
import { makeDraggable } from './images.js';
import { updateNotesButtonState } from './notes.js';

// Callbacks injected by app.js to avoid circular dependency with lessons.js
let _handleInput      = () => {};
let _handleInputRight = () => {};

export function setInputCallbacks(onInput, onInputRight) {
    _handleInput      = onInput;
    _handleInputRight = onInputRight;
}

export function renderOversikt() {
    const container = document.getElementById('view-oversikt');
    if (!container) return;
    container.innerHTML = '';
    const weekKey = `${currentYear}-W${currentWeek}`;
    const monday = getMonday(currentYear, currentWeek);
    const wasCopied = plannerData[weekKey] && plannerData[weekKey]._copiedFrom;
    if (!plannerData[weekKey] || !plannerData[weekKey].lessons) {
        plannerData[weekKey] = { lessons: [[], [], [], [], []], dayNotes: ['', '', '', '', ''] };
    }
    days.forEach((dayName, idx) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + idx);
        const card = document.createElement('div');
        card.className = 'card p-5 flex flex-col min-h-[450px] transition-all hover:shadow-lg cursor-default';
        sortPlannerData(weekKey, idx);
        const lessons = (plannerData[weekKey].lessons && plannerData[weekKey].lessons[idx])
            ? plannerData[weekKey].lessons[idx] : [];
        const notes = (plannerData[weekKey].dayNotes && plannerData[weekKey].dayNotes[idx])
            ? plannerData[weekKey].dayNotes[idx] : '';
        let lessonsHtml = '';
        lessons.forEach(lesson => {
            const isPlanned = checkIsPlanned(lesson.plan);
            const color = getSubjectColor(lesson.subject);
            const dotStyle    = color ? `style="background-color:${color.bg};box-shadow:0 0 4px ${color.bg}88"` : '';
            const subjectStyle = color ? `style="color:${color.text}"` : '';
            const bgStyle      = color ? `style="border-left: 3px solid ${color.bg}"` : 'style="border-left: 3px solid transparent"';
            lessonsHtml += `
                <div onclick="window.goToLesson(${idx}, ${lesson.id})" class="text-[11px] border-b border-gray-50 py-3 flex items-center gap-2 hover:bg-gray-50 cursor-pointer transition-colors rounded px-1" ${bgStyle}>
                    <span class="font-bold text-gray-400 w-12 shrink-0">${lesson.time}</span>
                    <span class="flex-1 ${isPlanned ? 'is-planned' : 'font-medium'} truncate" ${subjectStyle}>
                        ${isPlanned ? `<span class="status-dot" ${dotStyle}></span>` : ''}${lesson.subject}
                    </span>
                </div>`;
        });
        const copiedBadge = wasCopied && idx === 0
            ? `<span class="copy-badge ml-2">Kopierad</span>` : '';
        card.innerHTML = `
            <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                <h2 class="font-bold text-[#a6857e] text-lg serif-title flex items-center">${dayName}${copiedBadge}</h2>
                <span class="text-[10px] font-bold bg-gray-50 px-2 py-1 rounded text-gray-400">${date.getDate()} ${months[date.getMonth()].substring(0, 3)}</span>
            </div>
            <div class="flex-1 overflow-y-auto custom-scrollbar mb-4">
                ${lessonsHtml || '<p class="text-[10px] text-gray-300 italic mt-4 text-center">Inga lektioner</p>'}
                <button onclick="window.goToDayAndAdd(${idx})" class="w-full mt-4 text-[10px] text-gray-400 font-bold border border-dashed border-gray-200 p-2 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all uppercase">+ Lektion</button>
            </div>
            <div class="mt-auto pt-4 border-t border-gray-100">
                <label class="text-[10px] font-bold uppercase text-gray-400 mb-1 block">Anteckningar</label>
                <textarea class="notes-area custom-scrollbar" placeholder="Möte, rastvakt..." oninput="window.saveDayNote(${idx}, this.value)">${notes}</textarea>
            </div>
        `;
        container.appendChild(card);
    });
}

export function renderDayDetail() {
    const weekKey = `${currentYear}-W${currentWeek}`;
    sortPlannerData(weekKey, activeDayIndex);
    const lessons = (plannerData[weekKey] && plannerData[weekKey].lessons[activeDayIndex])
        ? plannerData[weekKey].lessons[activeDayIndex] : [];
    const listContainer = document.getElementById('detail-lesson-list');
    listContainer.innerHTML = '';
    const monday = getMonday(currentYear, currentWeek);
    const thisDate = new Date(monday);
    thisDate.setDate(monday.getDate() + activeDayIndex);
    document.getElementById('detail-day-name').innerText = days[activeDayIndex];
    document.getElementById('detail-date').innerText =
        `${thisDate.getDate()} ${months[thisDate.getMonth()]} ${currentYear}`;

    if (!activeLessonId && lessons.length > 0) setActiveLessonId(lessons[0].id);

    lessons.forEach(lesson => {
        const btn = document.createElement('div');
        const isActive  = lesson.id === activeLessonId;
        const isPlanned = checkIsPlanned(lesson.plan);
        const color = getSubjectColor(lesson.subject);
        if (isActive) {
            const bg = color ? color.bg : '#a6857e';
            btn.style.cssText = `background-color:${bg};border-color:${bg};color:white`;
            btn.className = 'w-full text-left p-5 rounded-2xl cursor-pointer transition-all shadow-sm border scale-[1.02] shadow-md';
        } else {
            btn.className = 'w-full text-left p-5 rounded-2xl cursor-pointer transition-all shadow-sm border bg-white border-gray-100 hover:bg-gray-50';
            if (color) btn.style.borderLeft = `4px solid ${color.bg}`;
        }
        btn.setAttribute('data-id', lesson.id);
        const timeColor    = isActive ? 'rgba(255,255,255,0.7)' : '#9ca3af';
        const subjectColor = isActive ? 'white' : (color ? color.text : 'inherit');
        btn.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex-1 overflow-hidden pr-2">
                    <div class="text-[10px] uppercase font-bold mb-1" style="color:${timeColor}">${lesson.time}</div>
                    <div class="text-xl lesson-subject-title truncate ${isPlanned ? 'is-planned' : 'font-bold'}" style="color:${subjectColor}">
                        ${isPlanned && !isActive ? `<span class="status-dot" ${color ? `style="background:${color.bg}"` : ''}></span>` : ''}${lesson.subject}
                    </div>
                </div>
                <button onclick="window.deleteLesson(${lesson.id}, event)" class="text-lg opacity-30 hover:opacity-100 px-2 flex-shrink-0">&times;</button>
            </div>`;
        btn.onclick = () => { setActiveLessonId(lesson.id); renderDayDetail(); };
        listContainer.appendChild(btn);

        if (isActive) {
            const sbSubject = document.getElementById('sb-subject');
            sbSubject.innerText = lesson.subject;
            sbSubject.style.color = color ? color.bg : '#a6857e';
            document.getElementById('sb-time').innerText = 'Klockan ' + lesson.time;
            document.getElementById('sb-plan').innerHTML = lesson.plan || '';
            document.getElementById('sb-plan-right').innerHTML = lesson.planRight || '';
            const isSplit = !!lesson.planRight || lesson.split;
            setSplitView(isSplit);

            ['#sb-plan', '#sb-plan-right'].forEach(sel => {
                document.querySelectorAll(sel + ' .img-wrapper').forEach(wrapper => {
                    wrapper.contentEditable = false;
                    const resizeHandle = wrapper.querySelector('.img-resize-handle');
                    const delBtn       = wrapper.querySelector('.img-delete-btn');
                    const cb = sel === '#sb-plan-right' ? _handleInputRight : _handleInput;
                    if (resizeHandle) makeDraggable(wrapper, resizeHandle, cb);
                    if (delBtn) delBtn.onmousedown = (e) => { e.stopPropagation(); wrapper.remove(); cb(); };
                });
            });
            updateNotesButtonState(lesson);
        }
    });

    if (lessons.length === 0) {
        document.getElementById('sb-subject').innerText = 'Inga lektioner';
        document.getElementById('sb-time').innerText = "Klicka på '+ Ny lektion' för att börja";
        document.getElementById('sb-plan').innerHTML = '';
        setActiveLessonId(null);
        updateNotesButtonState(null);
    }
}

export function renderFutureWeeks() {
    const grid = document.getElementById('future-weeks-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 52; i++) {
        const card = document.createElement('div');
        const isCurrent = i === currentWeek;
        card.className = `card p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-white transition-all border-none ${isCurrent ? 'ring-2 ring-[#a6857e] bg-white' : 'bg-white/50 opacity-60 hover:opacity-100'}`;
        card.onclick = () => window.changeWeekTo(i);
        card.innerHTML = `<div class="text-[9px] text-gray-400 uppercase font-bold mb-1">${currentYear}</div><div class="font-bold text-lg text-[#a6857e]">v.${i}</div>`;
        grid.appendChild(card);
    }
}

// Split-view helpers (kept here since renderDayDetail uses them)
export function setSplitView(on) {
    const divider = document.getElementById('sb-plan-divider');
    const right   = document.getElementById('sb-plan-right');
    const btn     = document.getElementById('split-btn');
    if (on) {
        divider.classList.remove('hidden');
        right.classList.remove('hidden');
        btn && btn.classList.add('active');
    } else {
        divider.classList.add('hidden');
        right.classList.add('hidden');
        btn && btn.classList.remove('active');
    }
}
