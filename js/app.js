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
    openCurriculumMap
} from './academicPlanning.js';
import {
    initTodo, toggleTodoPanel, closeTodoPanel,
    toggleTodoDone, deleteTodoItem, toggleCompletedSection
} from './todo.js';

// Inject handleInput callbacks into render.js to avoid circular imports
setInputCallbacks(handleInput, handleInputRight);

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
