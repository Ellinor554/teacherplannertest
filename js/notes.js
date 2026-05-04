import { plannerData, currentYear, currentWeek, activeDayIndex, activeLessonId } from './state.js';
import { saveData } from './persistence.js';

export function updateNotesButtonState(lesson) {
    const notesBtn = document.getElementById('notes-btn');
    if (!notesBtn) return;
    if (lesson?.privateNotes?.trim()) {
        notesBtn.classList.add('active');
    } else {
        notesBtn.classList.remove('active');
    }
}

export function toggleNotesModal() {
    const modal = document.getElementById('lesson-notes-modal');
    if (modal.classList.contains('hidden')) {
        openNotesModal();
    } else {
        closeNotesModal();
    }
}

export function openNotesModal() {
    if (!activeLessonId) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey] && plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (!lesson) return;
    document.getElementById('notes-modal-lesson-name').innerText = lesson.subject + ' – ' + lesson.time;
    document.getElementById('private-notes-textarea').value = lesson.privateNotes || '';
    document.getElementById('lesson-notes-modal').classList.remove('hidden');
    document.getElementById('private-notes-textarea').focus();
}

export function closeNotesModal() {
    savePrivateNotes();
    document.getElementById('lesson-notes-modal').classList.add('hidden');
}

export function handleNotesModalBackdrop(event) {
    if (event.target === document.getElementById('lesson-notes-modal')) {
        closeNotesModal();
    }
}

export function savePrivateNotes() {
    if (!activeLessonId) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey] && plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (lesson) {
        lesson.privateNotes = document.getElementById('private-notes-textarea').value;
        saveData();
        updateNotesButtonState(lesson);
    }
}
