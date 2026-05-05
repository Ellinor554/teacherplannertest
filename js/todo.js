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
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    todos.unshift({ id, text, done: false });
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

const SVG_NS = 'http://www.w3.org/2000/svg';

function renderTodoList() {
    const activeList    = document.getElementById('todo-active-list');
    const completedList = document.getElementById('todo-completed-list');
    const countBadge    = document.getElementById('todo-completed-count');
    if (!activeList || !completedList) return;

    const active = todos.filter(t => !t.done);
    const done   = todos.filter(t => t.done);

    populateList(activeList, active, false, 'Inga aktiva uppgifter');
    populateList(completedList, done, true, 'Inga avklarade uppgifter');

    if (countBadge) {
        countBadge.textContent = done.length > 0 ? ` (${done.length})` : '';
    }
}

function populateList(listEl, items, isDone, emptyMessage) {
    listEl.textContent = '';
    if (items.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'todo-empty';
        empty.textContent = emptyMessage;
        listEl.appendChild(empty);
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.appendChild(buildTodoItem(item, isDone)));
    listEl.appendChild(fragment);
}

function buildTodoItem(item, isDone) {
    const li = document.createElement('li');
    li.className = isDone ? 'todo-item todo-item-done' : 'todo-item';
    li.dataset.id = item.id;

    // Circular checkbox button with inline SVG
    const checkBtn = document.createElement('button');
    checkBtn.className = 'todo-checkbox';
    checkBtn.setAttribute('aria-label', isDone ? 'Markera som aktiv' : 'Markera som klar');
    checkBtn.appendChild(buildCheckboxSvg(isDone));
    checkBtn.addEventListener('click', () => toggleTodoDone(item.id));

    // Text span
    const textSpan = document.createElement('span');
    textSpan.className = isDone ? 'todo-text todo-text-done' : 'todo-text';
    textSpan.textContent = item.text;
    textSpan.addEventListener('click', () => toggleTodoDone(item.id));

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'todo-delete';
    delBtn.setAttribute('aria-label', 'Ta bort');
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => deleteTodoItem(item.id));

    li.appendChild(checkBtn);
    li.appendChild(textSpan);
    li.appendChild(delBtn);
    return li;
}

function buildCheckboxSvg(isDone) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '8');
    circle.setAttribute('cy', '8');
    circle.setAttribute('r', '7');
    circle.setAttribute('stroke', '#c8b49a');
    circle.setAttribute('stroke-width', '1.5');

    if (isDone) {
        circle.setAttribute('fill', '#c8b49a');
        const check = document.createElementNS(SVG_NS, 'path');
        check.setAttribute('d', 'M5 8l2 2 4-4');
        check.setAttribute('stroke', 'white');
        check.setAttribute('stroke-width', '1.5');
        check.setAttribute('stroke-linecap', 'round');
        check.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(circle);
        svg.appendChild(check);
    } else {
        svg.appendChild(circle);
    }
    return svg;
}
