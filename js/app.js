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
    startStopwatch, pauseStopwatch, resetStopwatch
} from './tools.js';
import {
    updateClock, toggleSidebar, toggleFullscreen,
    toggleBottomToolbar, updateFontSize, toggleSplit
} from './ui.js';

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
window.savePlannerAs       = savePlannerAs;
window.openPlannerFile     = () => openPlannerFile(refreshUI);
window.downloadBackup      = downloadBackup;
window.importBackup        = (e) => importBackup(e, refreshUI);

// ── Initialisation ──────────────────────────────────────────────────────────
window.onload = () => {
    migrateData();
    saveData(); // persist any format migrations to localStorage
    updateClock();
    setInterval(updateClock, 1000);
    renderFutureWeeks();
    refreshUI();
    updateFontSize(32);

    // Verktygslådan startar dold
    document.getElementById('bottom-toolbar').style.display = 'none';

    updateFileStatus('localStorage (ingen diskfil kopplad)');

    // Close lesson-notes modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('lesson-notes-modal');
            if (modal && !modal.classList.contains('hidden')) {
                closeNotesModal();
            }
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
