/**
 * TaskForge — script.js
 * Advanced Task Manager | Vanilla JS + LocalStorage
 * =====================================================
 * Architecture:
 *   - State is a plain object; UI is always re-derived from state.
 *   - LocalStorage is the single source of truth between sessions.
 *   - All mutations go through updateState() → persist() → render().
 */

'use strict';

/* =============================================
   1.  STATE
   ============================================= */

/** @type {{ tasks: Task[], filter: string, searchQuery: string, editingId: string|null }} */
let state = {
  tasks:       [],      // Array of task objects
  filter:      'all',   // 'all' | 'pending' | 'completed'
  searchQuery: '',      // Live search text
  editingId:   null,    // ID of task being edited, or null
};

/**
 * @typedef {Object} Task
 * @property {string}  id        - Unique identifier (timestamp-based)
 * @property {string}  title     - Task title
 * @property {string}  due       - ISO date string (YYYY-MM-DD)
 * @property {string}  priority  - 'low' | 'medium' | 'high'
 * @property {boolean} completed - Completion status
 * @property {number}  createdAt - Unix timestamp (ms)
 */

/* =============================================
   2.  LOCAL STORAGE  (Persistence)
   ============================================= */

const STORAGE_KEY = 'taskforge_tasks';

/**
 * Load tasks from LocalStorage.
 * JSON.parse is wrapped in try/catch to handle corrupt data gracefully.
 * @returns {Task[]}
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('TaskForge: Failed to parse stored tasks.', e);
    return [];
  }
}

/**
 * Persist current tasks array to LocalStorage.
 * Called after every mutation so data survives page reloads.
 */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) {
    console.error('TaskForge: Failed to save tasks.', e);
  }
}

/* =============================================
   3.  STATE MUTATIONS
   ============================================= */

/**
 * Central state update → persist → re-render pipeline.
 * @param {Partial<typeof state>} patch - Fields to merge into state.
 */
function updateState(patch) {
  Object.assign(state, patch);
  saveToStorage();   // Persist every time state changes
  render();          // Re-derive UI from new state
}

/**
 * Generate a unique task ID using current timestamp + random suffix.
 * @returns {string}
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Add a new task to the top of the list. */
function addTask({ title, due, priority }) {
  const newTask = {
    id:        generateId(),
    title:     title.trim(),
    due,
    priority,
    completed: false,
    createdAt: Date.now(),
  };
  updateState({ tasks: [newTask, ...state.tasks] });
  showToast('Task added ✓', 'success');
}

/** Persist edits to an existing task by ID. */
function updateTask(id, { title, due, priority }) {
  const tasks = state.tasks.map(t =>
    t.id === id ? { ...t, title: title.trim(), due, priority } : t
  );
  updateState({ tasks, editingId: null });
  showToast('Task updated ✓', 'info');
}

/** Toggle the completed flag on a task. */
function toggleTask(id) {
  const tasks = state.tasks.map(t =>
    t.id === id ? { ...t, completed: !t.completed } : t
  );
  updateState({ tasks });
}

/**
 * Animate a task item out, then remove it from state.
 * @param {string} id - Task ID to remove.
 */
function deleteTask(id) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    // Trigger CSS exit animation, then mutate state
    el.classList.add('removing');
    el.addEventListener('animationend', () => {
      const tasks = state.tasks.filter(t => t.id !== id);
      updateState({ tasks });
    }, { once: true });
  } else {
    const tasks = state.tasks.filter(t => t.id !== id);
    updateState({ tasks });
  }
  showToast('Task deleted', 'error');
}

/* =============================================
   4.  FILTERING & SEARCHING
   ============================================= */

/**
 * Derive the visible task list from current state.
 * @returns {Task[]}
 */
function getVisibleTasks() {
  const q = state.searchQuery.toLowerCase().trim();

  return state.tasks.filter(task => {
    // Filter tab logic
    const matchesFilter =
      state.filter === 'all'       ||
      (state.filter === 'completed' &&  task.completed) ||
      (state.filter === 'pending'   && !task.completed);

    // Search: match against title
    const matchesSearch = !q || task.title.toLowerCase().includes(q);

    return matchesFilter && matchesSearch;
  });
}

/* =============================================
   5.  RENDERING
   ============================================= */

/** Master render — updates stats, task list, and empty state. */
function render() {
  renderStats();
  renderTasks();
}

/** Update the three counters in the header. */
function renderStats() {
  const total     = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const pending   = total - completed;

  document.getElementById('totalCount').textContent     = total;
  document.getElementById('completedCount').textContent = completed;
  document.getElementById('pendingCount').textContent   = pending;
}

/** Render the visible task list (or empty state). */
function renderTasks() {
  const list      = document.getElementById('taskList');
  const emptyState = document.getElementById('emptyState');
  const visible   = getVisibleTasks();

  list.innerHTML = '';  // Clear existing DOM nodes

  if (visible.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  // Build each task item via DocumentFragment for performance
  const fragment = document.createDocumentFragment();
  visible.forEach(task => {
    fragment.appendChild(createTaskElement(task));
  });
  list.appendChild(fragment);
}

/**
 * Create a single <li> DOM element for a task.
 * @param {Task} task
 * @returns {HTMLLIElement}
 */
function createTaskElement(task) {
  const isOverdue = task.due && !task.completed && new Date(task.due) < new Date();

  const li = document.createElement('li');
  li.className  = `task-item${task.completed ? ' completed' : ''}`;
  li.dataset.id = task.id;
  li.dataset.priority = task.priority;

  li.innerHTML = `
    <!-- Checkbox (toggle completion) -->
    <button class="task-checkbox" aria-label="Toggle completion" title="Mark as ${task.completed ? 'pending' : 'done'}">
      ${task.completed ? '✓' : ''}
    </button>

    <!-- Task body: title + meta -->
    <div class="task-body">
      <p class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</p>
      <div class="task-meta">
        ${task.due
          ? `<span class="task-due${isOverdue ? ' overdue' : ''}"
                   title="${isOverdue ? 'Overdue!' : ''}">
               📅 ${formatDate(task.due)}${isOverdue ? ' ⚠' : ''}
             </span>`
          : '<span class="task-due">No due date</span>'
        }
        <span class="priority-badge ${task.priority}">${task.priority}</span>
      </div>
    </div>

    <!-- Action buttons: edit & delete -->
    <div class="task-actions">
      <button class="icon-btn edit" aria-label="Edit task" title="Edit">✏️</button>
      <button class="icon-btn delete" aria-label="Delete task" title="Delete">🗑️</button>
    </div>
  `;

  // Attach event listeners directly to the element
  li.querySelector('.task-checkbox').addEventListener('click', () => toggleTask(task.id));
  li.querySelector('.icon-btn.edit').addEventListener('click', () => startEdit(task));
  li.querySelector('.icon-btn.delete').addEventListener('click', () => openDeleteModal(task.id));

  return li;
}

/* =============================================
   6.  FORM — ADD & EDIT
   ============================================= */

/** Read and validate form fields. Returns null if invalid. */
function getFormValues() {
  const title    = document.getElementById('taskTitle').value.trim();
  const due      = document.getElementById('taskDue').value;
  const priority = document.getElementById('taskPriority').value;

  if (!title) {
    showToast('Please enter a task title', 'error');
    document.getElementById('taskTitle').focus();
    return null;
  }
  return { title, due, priority };
}

/** Clear all form fields and reset to "add" mode. */
function resetForm() {
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDue').value      = '';
  document.getElementById('taskPriority').value = 'medium';
  document.getElementById('formTitle').textContent = 'New Task';
  document.getElementById('saveTaskBtn').textContent = 'Add Task';
  document.getElementById('cancelEditBtn').style.display = 'none';
  state.editingId = null;
}

/** Populate form for editing an existing task. */
function startEdit(task) {
  document.getElementById('taskTitle').value    = task.title;
  document.getElementById('taskDue').value      = task.due || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('formTitle').textContent = 'Edit Task';
  document.getElementById('saveTaskBtn').textContent = 'Save Changes';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  state.editingId = task.id;

  // Scroll smoothly to form
  document.getElementById('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('taskTitle').focus();
}

/** Handle the Save / Add button click. */
function handleSave() {
  const values = getFormValues();
  if (!values) return;

  if (state.editingId) {
    updateTask(state.editingId, values);
  } else {
    addTask(values);
  }
  resetForm();
}

/* =============================================
   7.  DELETE MODAL
   ============================================= */

let pendingDeleteId = null;  // Holds ID awaiting confirmation

function openDeleteModal(id) {
  pendingDeleteId = id;
  const overlay = document.getElementById('modalOverlay');
  overlay.style.display = 'grid';
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('modalOverlay').style.display = 'none';
}

function confirmDelete() {
  if (pendingDeleteId) deleteTask(pendingDeleteId);
  closeDeleteModal();
}

/* =============================================
   8.  TOAST NOTIFICATIONS
   ============================================= */

let toastTimer = null;

/**
 * Show a brief toast notification.
 * @param {string} message - Text to display.
 * @param {'success'|'error'|'info'} type - Visual style.
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = `toast ${type} show`;

  // Clear any running dismiss timer
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

/* =============================================
   9.  DARK / LIGHT MODE TOGGLE
   ============================================= */

const THEME_KEY = 'taskforge_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* =============================================
   10.  UTILITY HELPERS
   ============================================= */

/**
 * Sanitize a string to prevent XSS when injecting into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format an ISO date string (YYYY-MM-DD) into a human-readable form.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  // Parse as UTC to avoid timezone-shift issues
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* =============================================
   11.  EVENT WIRING  (DOM ready)
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* — Load stored tasks — */
  state.tasks = loadFromStorage();

  /* — Apply saved theme — */
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  /* — Initial render — */
  render();

  /* ─ Form: Save button ─ */
  document.getElementById('saveTaskBtn').addEventListener('click', handleSave);

  /* ─ Form: Allow Enter key to submit ─ */
  document.getElementById('taskTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSave();
  });

  /* ─ Form: Cancel edit ─ */
  document.getElementById('cancelEditBtn').addEventListener('click', resetForm);

  /* ─ Filter tabs ─ */
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Toggle active class on tabs
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updateState({ filter: tab.dataset.filter });
    });
  });

  /* ─ Search input: live filtering ─ */
  document.getElementById('searchInput').addEventListener('input', e => {
    updateState({ searchQuery: e.target.value });
  });

  /* ─ Delete modal: confirm / cancel ─ */
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);

  /* ─ Close modal on backdrop click ─ */
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  /* ─ Close modal on Escape key ─ */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDeleteModal();
      if (state.editingId) resetForm();
    }
  });

  /* ─ Dark/Light toggle ─ */
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

});
