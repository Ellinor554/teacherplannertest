import { migrateData } from './data.js';
import { saveData, savePlannerAs, openPlannerFile, downloadBackup, importBackup, updateFileStatus } from './persistence.js';
import { setInputCallbacks, renderFutureWeeks } from './render.js';
import { refreshUI, changeView, changeWeek, changeWeekTo, goToLesson } from './navigation.js';
import {
    addLessonPrompt, deleteLesson, goToDayAndAdd,
    handleInput, handleInputRight, handlePaste, handlePasteRight,
    saveDayNote
} from './lessons.js';
import { insertImageFromFile } from './images.js';
import { toggleNotesModal, closeNotesModal, handleNotesModalBackdrop, savePrivateNotes } from './notes.js';
import {
    openTool, closeTool, closeFloatingTool,
    startTimer, pauseTimer, resetTimer,
    startStopwatch, pauseStopwatch, resetStopwatch,
    buildToolLauncher, addSavedPresentationFromSettings, initPresentationSettings
} from './tools.js';
import {
    updateClock, toggleSidebar, toggleFullscreen,
    toggleBottomToolbar, updateFontSize, toggleSplit, toggleSettingsMenu
} from './ui.js';
import {
    initAcademicPlanning, renderAcademicPlanningView,
    openPlanningPresentationPicker, closePlanningPresentationPicker,
    openCurriculumMap, archiveCurrentYear, openArchiveOverlay,
    selectAcademicSubject, deleteAcademicSubjectData
} from './academicPlanning.js';
import {
    initTodo, toggleTodoPanel, closeTodoPanel,
    toggleTodoDone, deleteTodoItem, toggleCompletedSection
} from './todo.js';
import { getSubjects, addSubject, deleteSubject } from './subjects.js';

// Inject handleInput callbacks into render.js to avoid circular imports
setInputCallbacks(handleInput, handleInputRight);

// ── Subject Manager UI ──────────────────────────────────────────────────────

function renderSidebarSubjects() {
    const container = document.getElementById('sidebar-subjects');
    if (!container) return;
    container.innerHTML = '';
    const subjects = getSubjects();
    subjects.forEach((s) => {
        const btn = document.createElement('button');
        btn.className = 'sidebar-subject-icon-btn';
        btn.title = s.name;
        btn.style.background = s.color;
        btn.textContent = s.icon;
        btn.addEventListener('click', () => {
            selectAcademicSubject(s.key);
            changeView('lasarsplanering');
        });
        container.appendChild(btn);
    });
}

function renderSubjectManagerList() {
    const list = document.getElementById('subject-manager-list');
    if (!list) return;
    list.innerHTML = '';
    const subjects = getSubjects();
    if (!subjects.length) {
        const empty = document.createElement('p');
        empty.className = 'subject-manager-empty';
        empty.textContent = 'Inga ämnen ännu. Lägg till ett nedan.';
        list.appendChild(empty);
        return;
    }
    subjects.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'subject-manager-row';

        const swatch = document.createElement('span');
        swatch.className = 'subject-manager-swatch';
        swatch.style.background = s.color;
        swatch.textContent = s.icon;

        const name = document.createElement('span');
        name.className = 'subject-manager-name';
        name.textContent = s.name;

        const delBtn = document.createElement('button');
        delBtn.className = 'subject-manager-delete-btn';
        delBtn.title = 'Ta bort ämne';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => window.deleteSubjectFromUI(s.key));

        row.appendChild(swatch);
        row.appendChild(name);
        row.appendChild(delBtn);
        list.appendChild(row);
    });
}

window.openSubjectManager = function () {
    const modal = document.getElementById('subject-manager-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderSubjectManagerList();
    }
};

window.closeSubjectManager = function () {
    const modal = document.getElementById('subject-manager-modal');
    if (modal) modal.classList.add('hidden');
};

window.handleSubjectManagerBackdrop = function (e) {
    if (e.target === document.getElementById('subject-manager-modal')) {
        window.closeSubjectManager();
    }
};

window.addSubjectFromUI = function () {
    const nameEl  = document.getElementById('sm-name');
    const iconEl  = document.getElementById('sm-icon');
    const colorEl = document.getElementById('sm-color');
    const errEl   = document.getElementById('sm-error');
    if (!nameEl || !iconEl || !colorEl) return;

    const name  = nameEl.value.trim();
    const icon  = iconEl.value.trim() || name.slice(0, 2);
    const color = colorEl.value;

    errEl.classList.add('hidden');

    if (!name) {
        errEl.textContent = 'Ange ett namn för ämnet.';
        errEl.classList.remove('hidden');
        return;
    }

    const result = addSubject({ name, icon, color });
    if (!result) {
        errEl.textContent = 'Ett ämne med detta namn finns redan.';
        errEl.classList.remove('hidden');
        return;
    }

    nameEl.value = '';
    iconEl.value = '';
    colorEl.value = '#778899';
    renderSubjectManagerList();
    renderSidebarSubjects();
    refreshUI(); // re-render lesson cards with new color mapping
};

window.deleteSubjectFromUI = function (key) {
    if (!confirm('Är du säker? All planering kopplad till detta ämne raderas.')) return;
    deleteSubject(key);
    deleteAcademicSubjectData(key);
    renderSubjectManagerList();
    renderSidebarSubjects();
    renderAcademicPlanningView();
    refreshUI();
};

// ── Expose all functions that HTML onclick attributes call ──────────────────
window.changeView          = changeView;
window.changeWeek          = changeWeek;
window.changeWeekTo        = changeWeekTo;
window.goToLesson          = goToLesson;
window.goToDayAndAdd       = goToDayAndAdd;
window.addLessonPrompt     = addLessonPrompt;
window.deleteLesson        = deleteLesson;
window.saveDayNote         = saveDayNote;
window.handleInput         = handleInput;
window.handleInputRight    = handleInputRight;
window.handlePaste         = handlePaste;
window.handlePasteRight    = handlePasteRight;
window.insertImageFromFile = (input) => insertImageFromFile(input, handleInput, handleInputRight);
window.toggleNotesModal    = toggleNotesModal;
window.closeNotesModal     = closeNotesModal;
window.handleNotesModalBackdrop = handleNotesModalBackdrop;
window.savePrivateNotes    = savePrivateNotes;
window.openTool            = openTool;
window.closeTool           = closeTool;
window.closeFloatingTool   = closeFloatingTool;
window.startTimer          = startTimer;
window.pauseTimer          = pauseTimer;
window.resetTimer          = resetTimer;
window.startStopwatch      = startStopwatch;
window.pauseStopwatch      = pauseStopwatch;
window.resetStopwatch      = resetStopwatch;
window.toggleSidebar       = toggleSidebar;
window.toggleFullscreen    = toggleFullscreen;
window.toggleBottomToolbar = toggleBottomToolbar;
window.updateFontSize      = updateFontSize;
window.toggleSplit         = toggleSplit;
window.toggleSettingsMenu  = toggleSettingsMenu;
window.triggerImportBackup = () => {
    document.getElementById('import-file-input').click();
    toggleSettingsMenu();
};
window.savePlannerAs       = savePlannerAs;
window.openPlannerFile     = () => openPlannerFile(refreshUI);
window.downloadBackup      = downloadBackup;
window.importBackup        = (e) => importBackup(e, refreshUI);
window.toggleTodoPanel     = toggleTodoPanel;
window.closeTodoPanel      = closeTodoPanel;
window.toggleTodoDone      = toggleTodoDone;
window.deleteTodoItem      = deleteTodoItem;
window.toggleCompletedSection = toggleCompletedSection;
window.addSavedPresentationFromSettings = addSavedPresentationFromSettings;
window.openPlanningPresentationPicker = openPlanningPresentationPicker;
window.closePlanningPresentationPicker = closePlanningPresentationPicker;
window.openCurriculumMap = openCurriculumMap;
window.archiveCurrentYear = archiveCurrentYear;
window.openArchiveOverlay = openArchiveOverlay;

// ── Initialisation ──────────────────────────────────────────────────────────
window.onload = () => {
    migrateData();
    saveData(); // persist any format migrations to localStorage
    updateClock();
    setInterval(updateClock, 1000);
    renderFutureWeeks();
    refreshUI();
    updateFontSize(32);
    initTodo();

    // Verktygslådan startar dold
    document.getElementById('bottom-toolbar').style.display = 'none';

    // Build the categorised Tool Launcher
    buildToolLauncher(document.getElementById('tool-launcher-categories'));
    initPresentationSettings();
    initAcademicPlanning();
    renderAcademicPlanningView();
    renderSidebarSubjects();

    updateFileStatus('localStorage (ingen diskfil kopplad)');

    // Close lesson-notes modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('lesson-notes-modal');
            if (modal && !modal.classList.contains('hidden')) {
                closeNotesModal();
            }
            // Close settings menu
            const settingsMenu = document.getElementById('settings-menu');
            const settingsBtn  = document.getElementById('settings-btn');
            if (settingsMenu && !settingsMenu.classList.contains('hidden')) {
                settingsMenu.classList.add('hidden');
                if (settingsBtn) settingsBtn.classList.remove('active');
            }
            closeTodoPanel();
        }
    });

    // Close settings menu when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('settings-menu');
        const btn  = document.getElementById('settings-btn');
        if (menu && !menu.classList.contains('hidden') &&
            !menu.contains(e.target) && btn && !btn.contains(e.target)) {
            menu.classList.add('hidden');
            btn.classList.remove('active');
        }
    });

    // Update bold / italic toolbar button states
    document.addEventListener('selectionchange', () => {
        const boldBtn   = document.getElementById('bold-btn');
        const italicBtn = document.getElementById('italic-btn');
        if (boldBtn)   boldBtn.classList.toggle('active', document.queryCommandState('bold'));
        if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
    });
};

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.error('Service worker registration failed:', err);
        });
    });
}
