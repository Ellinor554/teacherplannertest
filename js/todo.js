const TODO_KEY = 'teacherplanner_todos';

let todos = [];
let completedOpen = false;

function loadTodos() {
    try {
        const raw = localStorage.getItem(TODO_KEY);
        todos = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(todos)) todos = [];
    } catch {
        todos = [];
    }
}

function saveTodos() {
    localStorage.setItem(TODO_KEY, JSON.stringify(todos));
}

export function initTodo() {
    loadTodos();
    renderTodoList();

    const input = document.getElementById('todo-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                addTodoItem(input.value.trim());
                input.value = '';
            }
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('todo-panel');
        const btn   = document.getElementById('todo-toggle-btn');
        if (!panel || !panel.classList.contains('todo-panel-open')) return;
        if (!panel.contains(e.target) && btn && !btn.contains(e.target)) {
            closeTodoPanel();
        }
    });
}

export function toggleTodoPanel() {
    const panel = document.getElementById('todo-panel');
    if (!panel) return;
    if (panel.classList.contains('todo-panel-open')) {
        closeTodoPanel();
    } else {
        openTodoPanel();
    }
}

function openTodoPanel() {
    const panel = document.getElementById('todo-panel');
    if (!panel) return;
    panel.classList.add('todo-panel-open');
    const btn = document.getElementById('todo-toggle-btn');
    if (btn) btn.classList.add('active');
    setTimeout(() => {
        const input = document.getElementById('todo-input');
        if (input) input.focus();
    }, 420);
}

export function closeTodoPanel() {
    const panel = document.getElementById('todo-panel');
    if (!panel) return;
    panel.classList.remove('todo-panel-open');
    const btn = document.getElementById('todo-toggle-btn');
    if (btn) btn.classList.remove('active');
}

function addTodoItem(text) {
    todos.unshift({ id: Date.now().toString(), text, done: false });
    saveTodos();
    renderTodoList();
}

export function toggleTodoDone(id) {
    const item = todos.find(t => t.id === id);
    if (!item) return;
    item.done = !item.done;
    saveTodos();
    renderTodoList();
}

export function deleteTodoItem(id) {
    todos = todos.filter(t => t.id !== id);
    saveTodos();
    renderTodoList();
}

export function toggleCompletedSection() {
    completedOpen = !completedOpen;
    const section = document.getElementById('todo-completed-list');
    const arrow   = document.getElementById('todo-completed-arrow');
    if (section) section.classList.toggle('hidden', !completedOpen);
    if (arrow)   arrow.textContent = completedOpen ? '▲' : '▼';
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderTodoList() {
    const activeList    = document.getElementById('todo-active-list');
    const completedList = document.getElementById('todo-completed-list');
    const countBadge    = document.getElementById('todo-completed-count');
    if (!activeList || !completedList) return;

    const active = todos.filter(t => !t.done);
    const done   = todos.filter(t => t.done);

    activeList.innerHTML = active.length
        ? active.map(item => todoItemHtml(item, false)).join('')
        : '<li class="todo-empty">Inga aktiva uppgifter</li>';

    completedList.innerHTML = done.length
        ? done.map(item => todoItemHtml(item, true)).join('')
        : '<li class="todo-empty">Inga avklarade uppgifter</li>';

    if (countBadge) {
        countBadge.textContent = done.length > 0 ? ` (${done.length})` : '';
    }
}

function todoItemHtml(item, isDone) {
    const checkboxInner = isDone
        ? `<circle cx="8" cy="8" r="7" fill="#c8b49a" stroke="#c8b49a" stroke-width="1.5"/>
           <path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<circle cx="8" cy="8" r="7" stroke="#c8b49a" stroke-width="1.5"/>`;

    return `<li class="todo-item${isDone ? ' todo-item-done' : ''}" data-id="${item.id}">
        <button class="todo-checkbox" onclick="toggleTodoDone('${item.id}')" aria-label="${isDone ? 'Markera som aktiv' : 'Markera som klar'}">
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">${checkboxInner}</svg>
        </button>
        <span class="todo-text${isDone ? ' todo-text-done' : ''}" onclick="toggleTodoDone('${item.id}')">${escapeHtml(item.text)}</span>
        <button class="todo-delete" onclick="deleteTodoItem('${item.id}')" aria-label="Ta bort">×</button>
    </li>`;
}
