/**
 * app.js — GymTracker PWA main application
 */

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'home',
  workout: null,       // active workout session
  workoutTimer: null,  // interval id
  workoutElapsed: 0,   // seconds
  activeExerciseIdx: 0, // track current exercise card
  restTimer: null,
  restRemaining: 0,
  restDuration: parseInt(localStorage.getItem('restDuration')) || 60,
  unit: localStorage.getItem('unit') || 'kg',
  libFilter: 'All',
  libSearch: '',
  progressTab: 'weight',
  animating: false
};

const CAT_COLORS = {
  Push: '#C8FF00',
  Pull: '#00c8ff',
  Legs: '#ff8800',
  Core: '#ff00c8',
  Cardio: '#ff4444',
  Custom: '#aaaaaa',
};

// ─── Utility ──────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function dateKey(d = new Date()) {
  return d.toISOString().split('T')[0];
}
function todayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}
function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return dateKey(d);
}

// ─── Custom Scroll Wheel Picker ───────────────────────────────────────────────
let currentPickerCallback = null;
let pickerValues = [];

function openScrollPicker({ min, max, step, currentValue, unit, title, callback }) {
  const overlay = $('#scroll-picker-overlay');
  const list = $('#picker-drum-list');
  const titleEl = $('#picker-title');
  const confirmBtn = $('#picker-confirm-btn');
  
  if (!overlay || !list || !titleEl) return;
  
  titleEl.textContent = title || 'Select Value';
  list.innerHTML = '';
  pickerValues = [];
  
  let targetIdx = 0;
  let idx = 0;
  
  for (let val = min; val <= max; val = parseFloat((val + step).toFixed(2))) {
    pickerValues.push(val);
    const valText = step % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
    const item = el('div', 'drum-item', `${valText}${unit ? ' ' + unit : ''}`);
    item.dataset.val = val;
    
    if (idx === 0 || Math.abs(val - currentValue) < Math.abs(pickerValues[targetIdx] - currentValue)) {
      targetIdx = idx;
    }
    
    const currentIdx = idx;
    item.addEventListener('click', () => {
      list.scrollTo({ top: currentIdx * 36, behavior: 'smooth' });
    });
    
    list.appendChild(item);
    idx++;
  }
  
  currentPickerCallback = callback;
  
  overlay.style.display = 'flex';
  overlay.offsetHeight;
  overlay.classList.add('active');
  
  list.scrollTop = targetIdx * 36;
  
  const updateSelections = () => {
    const selectedIdx = Math.round(list.scrollTop / 36);
    const items = list.querySelectorAll('.drum-item');
    items.forEach((item, i) => {
      const diff = Math.abs(i - selectedIdx);
      item.classList.toggle('selected', diff === 0);
      item.classList.toggle('faded', diff > 0);
    });
  };
  
  list.addEventListener('scroll', updateSelections);
  updateSelections();
  
  // Scroll to index on delay to ensure render layout finished
  setTimeout(() => {
    list.scrollTop = targetIdx * 36;
    updateSelections();
  }, 40);
  
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  newConfirmBtn.addEventListener('click', () => {
    const finalIdx = Math.round(list.scrollTop / 36);
    const finalVal = pickerValues[finalIdx];
    if (currentPickerCallback) {
      currentPickerCallback(finalVal);
    }
    closeScrollPicker();
  });
}

function closeScrollPicker() {
  const overlay = $('#scroll-picker-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 220);
}

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// ─── Router ───────────────────────────────────────────────────────────────────
function navigate(view, opts = {}) {
  if (state.animating) return;
  state.animating = true;
  setTimeout(() => { state.animating = false; }, 250);

  if (view === 'dashboard') view = 'home';
  state.view = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const viewEl = $(`#view-${view}`);
  const navEl = $(`.nav-item[data-view="${view}"]`);
  if (viewEl) { viewEl.classList.add('active'); }
  if (navEl) { navEl.classList.add('active'); }
  // Render dynamic views
  if (view === 'home') renderDashboard();
  if (view === 'history') renderHistory();
  if (view === 'progress') renderProgress();
  if (view === 'profile') renderProfile();
  if (view === 'workout') renderWorkoutView();
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.replace('#', '') || 'home';
  navigate(hash);
});

// ─── Nav setup ────────────────────────────────────────────────────────────────
function initNav() {
  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      location.hash = view;
    });
  });
}

// ─── Active Workout Chip ──────────────────────────────────────────────────────
function updateActiveChip() {
  const chip = $('#active-chip');
  if (state.workout && state.view !== 'workout') {
    chip.classList.add('show');
    chip.querySelector('#chip-time').textContent = formatTime(state.workoutElapsed);
  } else {
    chip.classList.remove('show');
  }
}

// ─── Workout Timer ────────────────────────────────────────────────────────────
function startWorkoutTimer() {
  if (state.workoutTimer) return;
  state.workoutTimer = setInterval(() => {
    state.workoutElapsed++;
    const disp = $('#workout-elapsed');
    if (disp) disp.textContent = formatTime(state.workoutElapsed);
    updateActiveChip();
  }, 1000);
}

function stopWorkoutTimer() {
  clearInterval(state.workoutTimer);
  state.workoutTimer = null;
}

// ─── Rest Timer ───────────────────────────────────────────────────────────────
function startRestTimer(duration = state.restDuration) {
  state.restRemaining = duration;
  state.restTimerDuration = duration; // track for ring fraction
  const overlay = $('#rest-overlay');
  overlay.classList.add('active');
  updateRestRing();

  if (state.restTimer) clearInterval(state.restTimer);
  state.restTimer = setInterval(() => {
    state.restRemaining--;
    if (state.restRemaining <= 0) {
      clearInterval(state.restTimer);
      state.restTimer = null;
      overlay.classList.remove('active');
      showToast('Rest complete — go!');
      return;
    }
    updateRestRing();
  }, 1000);
}

function updateRestRing() {
  const cd = $('#rest-countdown');
  const ring = $('#rest-ring-progress');
  if (cd) cd.textContent = state.restRemaining;
  if (ring) {
    const total = state.restTimerDuration || state.restDuration || 90;
    const fraction = state.restRemaining / total;
    const circumference = 440;
    ring.style.strokeDashoffset = circumference * (1 - fraction);
  }
}

function skipRest() {
  clearInterval(state.restTimer);
  state.restTimer = null;
  $('#rest-overlay').classList.remove('active');
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
async function renderDashboard() {
  const view = $('#view-home');

  // Date & greeting
  const dateEl = $('#dash-date');
  const greetEl = $('#dash-greeting');
  const now = new Date();
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const username = localStorage.getItem('username') || 'Athlete';
  if (greetEl) greetEl.innerHTML = `Welcome back, <span>${username}</span>! 👋`;

  const [workouts, weightLogs, templates, allSets, exercises] = await Promise.all([
    db.workouts.getAll(),
    db.weightLogs.getAll(),
    db.templates.getAll(),
    db.sets.getAll(),
    db.exercises.getAll(),
  ]);

  // Current streak
  const streak = calculateStreak(workouts);
  const streakEl = $('#home-streak');
  if (streakEl) streakEl.textContent = `${streak}🔥`;

  // Current body weight
  const sortedWeights = [...weightLogs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const latestWeight = sortedWeights[0];
  const weightEl = $('#home-weight');
  if (weightEl) {
    weightEl.textContent = latestWeight ? `${latestWeight.weight} ${state.unit}` : '—';
  }

  // Last workout summary
  const sortedWorkouts = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const lastWorkout = sortedWorkouts[0];
  
  const lastDateEl = $('#home-last-workout-date');
  const lastNameEl = $('#home-last-workout-name');
  const lastMusclesEl = $('#home-last-workout-muscles');
  const lastVolEl = $('#home-last-workout-vol');

  if (lastWorkout) {
    const lwSets = allSets.filter(s => s.workoutId === lastWorkout.id);
    const lwVol = lwSets.reduce((acc, s) => acc + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
    
    // Get unique exercises in last workout
    const lwExIds = [...new Set(lwSets.map(s => s.exerciseId))];
    const lwExercises = exercises.filter(e => lwExIds.includes(e.id));
    
    // Muscle groups (categories / muscles)
    const allMuscles = lwExercises.flatMap(e => (e.muscles || '').split(',').map(m => m.trim())).filter(Boolean);
    const uniqueMuscles = [...new Set(allMuscles)].slice(0, 3).join(', ') || 'Various';

    if (lastDateEl) lastDateEl.textContent = formatDate(lastWorkout.date);
    if (lastNameEl) lastNameEl.textContent = lastWorkout.name || 'Workout';
    if (lastMusclesEl) lastMusclesEl.textContent = `Focus: ${uniqueMuscles}`;
    if (lastVolEl) lastVolEl.textContent = `${Math.round(lwVol)} ${state.unit}`;
  } else {
    if (lastDateEl) lastDateEl.textContent = '—';
    if (lastNameEl) lastNameEl.textContent = 'No workouts logged yet';
    if (lastMusclesEl) lastMusclesEl.textContent = 'Start training to see your summary!';
    if (lastVolEl) lastVolEl.textContent = '—';
  }

  // Weekly Stats
  const thisWeek = workouts.filter(w => weekStart(new Date(w.date)) === weekStart(new Date()));
  const weekSets = allSets.filter(s => {
    const w = workouts.find(w => w.id === s.workoutId);
    return w && weekStart(new Date(w.date)) === weekStart(new Date());
  });
  const weekVol = weekSets.reduce((acc, s) => acc + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);

  const statWorkoutsEl = $('#stat-workouts');
  const statSetsEl = $('#stat-sets');
  const statVolEl = $('#stat-vol');

  if (statWorkoutsEl) statWorkoutsEl.textContent = thisWeek.length;
  if (statSetsEl) statSetsEl.textContent = weekSets.length;
  if (statVolEl) {
    statVolEl.textContent = weekVol > 0 ? `${Math.round(weekVol / 1000)}k` : '0';
  }

  // Quick start templates
  renderQuickStartTemplates(templates);

  // Weekly volume bar chart
  renderVolumeChart(workouts, allSets);

  // Recent workouts
  renderRecentWorkouts(workouts, allSets);

  // Body weight sparkline
  renderWeightSparkline(weightLogs);
}

function renderQuickStartTemplates(templates) {
  const container = $('#quick-templates');
  if (!container) return;
  container.innerHTML = '';
  templates.slice(0, 3).forEach(t => {
    const card = el('div', 'quick-card fade-in');
    card.innerHTML = `
      <div class="qc-icon">📋</div>
      <div>
        <div class="qc-label">${t.name}</div>
        <div class="qc-sub">${(t.exercises || []).length} exercise${(t.exercises || []).length !== 1 ? 's' : ''}</div>
      </div>`;
    card.addEventListener('click', () => startWorkoutFromTemplate(t));
    container.appendChild(card);
  });
}

function renderVolumeChart(workouts, allSets) {
  const canvas = $('#volume-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth; const H = canvas.offsetHeight;
  if (W === 0) return;
  canvas.width = W; canvas.height = H;

  // Last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(dateKey(d));
  }

  const dayLabels = days.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' }));
  const dayVols = days.map(day => {
    const dayWorkouts = workouts.filter(w => w.date && w.date.startsWith(day));
    const ids = dayWorkouts.map(w => w.id);
    const sets = allSets.filter(s => ids.includes(s.workoutId));
    return sets.reduce((acc, s) => acc + ((parseFloat(s.weight)||0) * (parseInt(s.reps)||0)), 0);
  });

  const max = Math.max(...dayVols, 1);
  const barW = (W - 40) / 7;
  const barGap = 6;

  ctx.clearRect(0, 0, W, H);

  days.forEach((_, i) => {
    const x = 20 + i * barW + barGap / 2;
    const bw = barW - barGap;
    const bh = ((dayVols[i] / max) * (H - 30)) || 3;
    const y = H - bh - 20;

    const isToday = i === 6;
    const grad = ctx.createLinearGradient(0, y, 0, H - 20);
    grad.addColorStop(0, isToday ? '#C8FF00' : '#2a2a2a');
    grad.addColorStop(1, isToday ? 'rgba(200,255,0,0.2)' : '#1a1a1a');
    ctx.fillStyle = grad;

    const r = 4;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bw - r, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
    ctx.lineTo(x + bw, H - 20);
    ctx.lineTo(x, H - 20);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // label
    ctx.fillStyle = isToday ? '#C8FF00' : '#555';
    ctx.font = `500 10px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dayLabels[i], x + bw / 2, H - 4);
  });
}

async function renderRecentWorkouts(workouts, allSets) {
  const container = $('#recent-workouts');
  if (!container) return;
  const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  container.innerHTML = '';
  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏋️</div><div class="empty-state-title">No workouts yet</div><div class="empty-state-sub">Hit "New Workout" to start training</div></div>`;
    return;
  }
  for (const w of sorted) {
    const sets = allSets.filter(s => s.workoutId === w.id);
    const vol = sets.reduce((a, s) => a + ((parseFloat(s.weight)||0) * (parseInt(s.reps)||0)), 0);
    const item = el('div', 'workout-item fade-in');
    item.innerHTML = `
      <div class="workout-item-icon">🏋️</div>
      <div class="workout-item-body">
        <div class="workout-item-name">${w.name || 'Workout'}</div>
        <div class="workout-item-meta">${formatDate(w.date)} · ${formatTime(w.duration || 0)} · ${sets.length} sets</div>
      </div>
      <div class="workout-item-badge">${vol > 0 ? Math.round(vol) + state.unit : ''}</div>`;
    item.addEventListener('click', () => { location.hash = 'history'; });
    container.appendChild(item);
  }
}

function renderWeightSparkline(weightLogs) {
  const canvas = $('#weight-sparkline');
  if (!canvas) return;
  const entries = [...weightLogs].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-7);
  const W = canvas.parentElement.offsetWidth || 320;
  const H = canvas.parentElement.offsetHeight || 60;
  if (W === 0) return;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  if (entries.length < 2) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No data', W / 2, H / 2);
    return;
  }
  const vals = entries.map(e => e.weight);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const pts = entries.map((e, i) => ({
    x: (i / (entries.length - 1)) * (W - 8) + 4,
    y: H - 4 - ((e.weight - minV) / range) * (H - 12),
  }));

  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(200,255,0,0.15)');
  grad.addColorStop(1, 'rgba(200,255,0,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#C8FF00';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ─── Workout View ──────────────────────────────────────────────────────────────
function renderWorkoutView() {
  const container = $('#workout-exercises');
  if (!container) return;

  const emptyEl = $('#workout-empty');
  const activeEl = $('#workout-active');
  const setupEl = $('#workout-setup');

  if (state.workout) {
    if (emptyEl) emptyEl.style.display = 'none';
    if (setupEl) setupEl.style.display = 'none';
    if (activeEl) activeEl.style.display = 'flex';
    const summaryEl = $('#workout-summary');
    if (summaryEl) summaryEl.style.display = 'none';

    const elapsed = $('#workout-elapsed');
    if (elapsed) elapsed.textContent = formatTime(state.workoutElapsed);

    // Sync workout name display
    const nameEl = $('#workout-name');
    if (nameEl) {
      nameEl.textContent = state.workout.name || 'Workout';
      initWorkoutNameEdit_el(nameEl);
    }

    renderWorkoutExercises();
  } else {
    if (setupEl && setupEl.style.display === 'flex') {
      if (emptyEl) emptyEl.style.display = 'none';
      if (activeEl) activeEl.style.display = 'none';
    } else {
      if (emptyEl) emptyEl.style.display = 'flex';
      if (setupEl) setupEl.style.display = 'none';
      if (activeEl) activeEl.style.display = 'none';
    }
  }
}

function renderWorkoutExercises() {
  const container = $('#workout-exercises');
  if (!container || !state.workout) return;

  const currentEx = state.workout.exercises[state.activeExerciseIdx];
  if (!currentEx) {
    if (state.workout.exercises.length > 0) {
      state.activeExerciseIdx = 0;
      renderWorkoutExercises();
    } else {
      $('#workout-active').style.display = 'none';
      $('#workout-empty').style.display = 'flex';
    }
    return;
  }

  // Update exercise indicators
  const indicator = $('#active-ex-indicator');
  if (indicator) indicator.textContent = `Exercise ${state.activeExerciseIdx + 1} of ${state.workout.exercises.length}`;

  const nameEl = $('#active-ex-name');
  if (nameEl) nameEl.textContent = currentEx.name;

  const catEl = $('#active-ex-category');
  if (catEl) {
    catEl.textContent = currentEx.category;
    catEl.style.color = CAT_COLORS[currentEx.category] || 'var(--accent)';
  }

  // Populate Sets Tbody
  const tbody = $('#active-sets-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    currentEx.sets.forEach((set, setIdx) => {
      tbody.appendChild(buildSetRow(state.activeExerciseIdx, setIdx, set));
    });
  }

  // Load historical sets
  loadPreviousExerciseData(currentEx.id);
}

function buildSetRow(exIdx, setIdx, set) {
  const tr = el('tr', set.done ? 'set-done' : '');
  tr.id = `set-${exIdx}-${setIdx}`;
  
  const prBadge = set.isPR ? `<span style="font-size:10px; background:var(--accent); color:#0a0a0a; border-radius:4px; padding:2px 5px; font-weight:800; margin-left:6px; display:inline-block; vertical-align:middle; filter:drop-shadow(0 0 4px var(--accent-glow))">PR</span>` : '';
  
  tr.innerHTML = `
    <td>
      <span class="set-num ${set.done ? 'done' : ''}">${setIdx + 1}</span>
      ${prBadge}
    </td>
    <td>
      <button class="set-input-trigger" id="w-${exIdx}-${setIdx}" ${set.done ? 'disabled' : ''}>
        ${set.weight !== undefined && set.weight !== 0 ? `${set.weight} ${state.unit}` : '—'}
      </button>
    </td>
    <td>
      <button class="set-input-trigger" id="r-${exIdx}-${setIdx}" ${set.done ? 'disabled' : ''}>
        ${set.reps !== undefined && set.reps !== 0 ? `${set.reps} reps` : '—'}
      </button>
    </td>
    <td>
      <button class="set-check-btn ${set.done ? 'done' : ''}" id="chk-${exIdx}-${setIdx}" title="Save set">
        <i class="ti ${set.done ? 'ti-check' : 'ti-device-floppy'}"></i>
      </button>
    </td>
    <td>
      <button class="set-del-btn" title="Delete set"><i class="ti ti-trash"></i></button>
    </td>
  `;

  // Events
  tr.querySelector(`#w-${exIdx}-${setIdx}`).addEventListener('click', () => {
    openScrollPicker({
      min: 0,
      max: 300,
      step: 0.5,
      currentValue: set.weight || 0,
      unit: state.unit,
      title: 'Select Weight',
      callback: (val) => {
        state.workout.exercises[exIdx].sets[setIdx].weight = val;
        tr.querySelector(`#w-${exIdx}-${setIdx}`).textContent = `${val} ${state.unit}`;
        localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
      }
    });
  });
  tr.querySelector(`#r-${exIdx}-${setIdx}`).addEventListener('click', () => {
    openScrollPicker({
      min: 1,
      max: 50,
      step: 1,
      currentValue: set.reps || 10,
      unit: 'reps',
      title: 'Select Reps',
      callback: (val) => {
        state.workout.exercises[exIdx].sets[setIdx].reps = val;
        tr.querySelector(`#r-${exIdx}-${setIdx}`).textContent = `${val} reps`;
        localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
      }
    });
  });
  tr.querySelector(`#chk-${exIdx}-${setIdx}`).addEventListener('click', () => toggleSet(exIdx, setIdx));
  tr.querySelector('.set-del-btn').addEventListener('click', () => deleteSet(exIdx, setIdx));

  return tr;
}

function addSet(exIdx) {
  const lastSet = state.workout.exercises[exIdx].sets.slice(-1)[0] || {};
  state.workout.exercises[exIdx].sets.push({
    weight: lastSet.weight || 0,
    reps: lastSet.reps || 0,
    done: false,
    isPR: false
  });
  renderWorkoutExercises();
  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
}

async function deleteSet(exIdx, setIdx) {
  const set = state.workout.exercises[exIdx].sets[setIdx];
  if (set.dbId) {
    await db.sets.delete(set.dbId);
  }
  state.workout.exercises[exIdx].sets.splice(setIdx, 1);
  if (state.workout.exercises[exIdx].sets.length === 0) {
    state.workout.exercises[exIdx].sets.push({ weight: 0, reps: 0, done: false, isPR: false });
  }
  renderWorkoutExercises();
  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
}

async function isPersonalRecord(exerciseId, weight, reps) {
  const sets = await db.sets.getByExercise(exerciseId);
  const historicalSets = sets.filter(s => s.workoutId !== state.workout.id);
  if (historicalSets.length === 0) return true; // First time doing it is a PR!

  const maxWeight = Math.max(...historicalSets.map(s => parseFloat(s.weight) || 0));
  const setsAtWeight = historicalSets.filter(s => parseFloat(s.weight) === weight);
  const maxRepsAtWeight = setsAtWeight.length > 0 ? Math.max(...setsAtWeight.map(s => parseInt(s.reps) || 0)) : 0;

  return weight > maxWeight || (weight === maxWeight && reps > maxRepsAtWeight);
}

async function toggleSet(exIdx, setIdx) {
  const ex = state.workout.exercises[exIdx];
  const set = ex.sets[setIdx];
  
  const wInput = $(`#w-${exIdx}-${setIdx}`);
  const rInput = $(`#r-${exIdx}-${setIdx}`);
  
  const weight = parseFloat(wInput.value) || 0;
  const reps = parseInt(rInput.value) || 0;

  if (weight <= 0 || reps <= 0) {
    showToast('Enter weight & reps first!');
    return;
  }

  set.weight = weight;
  set.reps = reps;
  set.done = !set.done;

  if (set.done) {
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    // Check for PR
    const isPR = await isPersonalRecord(ex.id, weight, reps);
    if (isPR) {
      set.isPR = true;
      showToast('🏆 New Personal Record!');
      triggerPRAnimation();
    }

    // Save set to IndexedDB in real time
    const setRecord = {
      workoutId: state.workout.id,
      exerciseId: ex.id,
      weight: weight,
      reps: reps,
      unit: state.unit,
      done: true
    };

    if (set.dbId) {
      setRecord.id = set.dbId;
      await db.sets.update(setRecord);
    } else {
      const dbId = await db.sets.add(setRecord);
      set.dbId = dbId;
    }

    startRestTimer(90); // 90-second countdown rest timer
  } else {
    set.isPR = false;
    if (set.dbId) {
      await db.sets.delete(set.dbId);
      delete set.dbId;
    }
    skipRest();
  }

  renderWorkoutExercises();
  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
}

async function loadPreviousExerciseData(exerciseId) {
  const container = $('#active-ex-prev-data');
  if (!container) return;
  
  const allSets = await db.sets.getByExercise(exerciseId);
  const allWorkouts = await db.workouts.getAll();
  
  const historicalSets = allSets.filter(s => s.workoutId !== state.workout.id);
  if (historicalSets.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted)">No previous session data found.</span>';
    return;
  }
  
  const workoutIds = [...new Set(historicalSets.map(s => s.workoutId))];
  const historicalWorkouts = allWorkouts.filter(w => workoutIds.includes(w.id));
  historicalWorkouts.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  const lastWorkout = historicalWorkouts[0];
  if (!lastWorkout) {
    container.innerHTML = '<span style="color:var(--text-muted)">No previous session data found.</span>';
    return;
  }
  
  const lastWorkoutSets = historicalSets.filter(s => s.workoutId === lastWorkout.id);
  container.innerHTML = `<div style="font-weight:600; color:var(--text); margin-bottom:4px">Last session (${formatDate(lastWorkout.date)}):</div>`;
  lastWorkoutSets.forEach((s, idx) => {
    const row = el('div', '', `Set ${idx + 1}: <strong>${s.weight}${state.unit}</strong> × <strong>${s.reps}</strong> reps`);
    row.style.fontSize = '12px';
    row.style.color = 'var(--text-dim)';
    container.appendChild(row);
  });
}

async function initiateWorkoutSession(workoutName, exercisesList, templateId = null, customDate = null) {
  const workoutRecord = {
    name: workoutName || 'Workout',
    date: customDate || dateKey(),
    status: 'active',
    duration: 0,
    templateId: templateId,
    notes: ''
  };
  const workoutId = await db.workouts.add(workoutRecord);

  state.workout = {
    id: workoutId,
    name: workoutRecord.name,
    date: workoutRecord.date,
    exercises: exercisesList.map(ex => ({
      ...ex,
      sets: ex.sets || [{ weight: 0, reps: 0, done: false, isPR: false }]
    })),
    templateId: templateId,
    notes: ''
  };
  state.activeExerciseIdx = 0;
  state.workoutElapsed = 0;

  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
  localStorage.setItem('activeExerciseIdx', state.activeExerciseIdx);
  localStorage.setItem('activeWorkoutElapsed', state.workoutElapsed);

  startWorkoutTimer();
  renderWorkoutView();
  showToast('Workout started! Let\'s go! 🏋️');
}

async function startWorkoutFromTemplate(template) {
  const exercises = await Promise.all(
    (template.exercises || []).map(async (exId) => {
      const ex = await db.exercises.getById(exId);
      if (!ex) return null;
      const allSets = await db.sets.getByExercise(exId);
      const lastSets = allSets.slice(-3).map(s => ({ weight: s.weight, reps: s.reps, done: false, isPR: false }));
      return { ...ex, sets: lastSets.length ? lastSets : [{ weight: 0, reps: 0, done: false, isPR: false }] };
    })
  );
  const filtered = exercises.filter(Boolean);
  await initiateWorkoutSession(template.name, filtered, template.id);
}

function skipExercise() {
  if (state.activeExerciseIdx < state.workout.exercises.length - 1) {
    state.activeExerciseIdx++;
    renderWorkoutExercises();
    localStorage.setItem('activeExerciseIdx', state.activeExerciseIdx);
    showToast('Exercise skipped.');
  } else {
    // prompt workout end since it's the last exercise
    $('#finish-prompt-modal').classList.add('active');
  }
}

function finishExercise() {
  const modal = $('#finish-prompt-modal');
  if (modal) {
    const nextBtn = $('#prompt-next-ex-btn');
    if (nextBtn) {
      if (state.activeExerciseIdx === state.workout.exercises.length - 1) {
        nextBtn.style.display = 'none';
      } else {
        nextBtn.style.display = 'block';
      }
    }
    modal.classList.add('active');
  }
}

function handlePromptNextExercise() {
  $('#finish-prompt-modal').classList.remove('active');
  if (state.activeExerciseIdx < state.workout.exercises.length - 1) {
    state.activeExerciseIdx++;
    renderWorkoutExercises();
    localStorage.setItem('activeExerciseIdx', state.activeExerciseIdx);
  }
}

// ─── Workout Summary ─────────────────────────────────────────────────────────
function finishWorkout() {
  if (!state.workout) return;

  // Close prompt modal if open
  $('#finish-prompt-modal')?.classList.remove('active');

  // Stop timer but keep state for summary display
  stopWorkoutTimer();
  skipRest();

  showWorkoutSummary();
}

function showWorkoutSummary() {
  if (!state.workout) return;

  const exercises = state.workout.exercises;

  // Compute stats from saved sets in state
  const allSets = exercises.flatMap(ex => ex.sets.filter(s => s.done));
  const totalSets    = allSets.length;
  const totalReps    = allSets.reduce((acc, s) => acc + (parseInt(s.reps) || 0), 0);
  const totalVolume  = allSets.reduce((acc, s) => acc + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
  const prCount      = allSets.filter(s => s.isPR).length;
  const donedExercises = exercises.filter(ex => ex.sets.some(s => s.done));

  // --- Fill header ---
  const nameEl = $('#summary-name');
  if (nameEl) nameEl.textContent = state.workout.name || 'Workout Complete!';

  const dateEl = $('#summary-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  // --- Primary stats ---
  const durationEl = $('#summary-duration');
  if (durationEl) durationEl.textContent = formatTime(state.workoutElapsed);

  const volumeEl = $('#summary-volume');
  if (volumeEl) volumeEl.textContent = `${Math.round(totalVolume)} ${state.unit}`;

  const exEl    = $('#summary-exercises');
  const setsEl  = $('#summary-sets');
  const repsEl  = $('#summary-reps');
  if (exEl)   exEl.textContent   = donedExercises.length;
  if (setsEl) setsEl.textContent = totalSets;
  if (repsEl) repsEl.textContent = totalReps;

  // --- PR banner ---
  const prRow = $('#summary-prs-row');
  const prText = $('#summary-prs-text');
  if (prRow && prText) {
    if (prCount > 0) {
      prText.textContent = `🏆 ${prCount} new Personal Record${prCount > 1 ? 's' : ''} this session!`;
      prRow.style.display = 'block';
    } else {
      prRow.style.display = 'none';
    }
  }

  // --- Exercise breakdown list ---
  const listEl = $('#summary-exercise-list');
  if (listEl) {
    listEl.innerHTML = '';
    if (donedExercises.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px 0">No sets completed.</div>';
    } else {
      donedExercises.forEach(ex => {
        const done = ex.sets.filter(s => s.done);
        const maxW = Math.max(...done.map(s => parseFloat(s.weight) || 0));
        const exReps = done.reduce((acc, s) => acc + (parseInt(s.reps) || 0), 0);
        const exVol  = done.reduce((acc, s) => acc + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
        const hasPR  = done.some(s => s.isPR);
        const catColor = CAT_COLORS[ex.category] || '#aaa';

        const row = el('div', 'summary-ex-row');
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:8px;height:8px;border-radius:50%;background:${catColor};flex-shrink:0"></div>
            <span class="summary-ex-name">${ex.name}</span>
            ${hasPR ? `<span style="font-size:10px;background:var(--accent);color:#0a0a0a;border-radius:4px;padding:1px 5px;font-weight:800;margin-left:auto">PR</span>` : ''}
          </div>
          <div class="summary-ex-meta">
            <span><strong>${done.length}</strong> set${done.length !== 1 ? 's' : ''}</span>
            <span><strong>${exReps}</strong> reps</span>
            <span><strong>${maxW > 0 ? maxW + state.unit : '—'}</strong> max</span>
            <span style="color:var(--accent)"><strong>${Math.round(exVol)} ${state.unit}</strong></span>
          </div>
          <div class="summary-sets-mini">
            ${done.map((s, i) => `<span class="summary-set-pill${s.isPR ? ' pr' : ''}">S${i+1} ${s.weight}×${s.reps}</span>`).join('')}
          </div>
        `;
        listEl.appendChild(row);
      });
    }
  }

  // --- Show summary, hide active ---
  $('#workout-active').style.display = 'none';
  $('#workout-summary').style.display = 'flex';
  updateActiveChip();
}

async function confirmSaveWorkout() {
  if (!state.workout) {
    location.hash = 'history';
    return;
  }

  // Update workout status to completed in IndexedDB
  await db.workouts.update({
    id: state.workout.id,
    name: state.workout.name,
    date: state.workout.date,
    duration: state.workoutElapsed,
    status: 'completed',
    templateId: state.workout.templateId || null,
    notes: state.workout.notes || ''
  });

  // Clear localStorage
  localStorage.removeItem('activeWorkout');
  localStorage.removeItem('activeExerciseIdx');
  localStorage.removeItem('activeWorkoutElapsed');

  // Reset state
  const wasName = state.workout.name;
  state.workout = null;
  state.workoutElapsed = 0;
  updateActiveChip();

  // Reset summary view
  $('#workout-summary').style.display = 'none';
  $('#workout-empty').style.display = 'flex';

  // Sync PRs table in background
  syncAllPRs().catch(console.warn);

  showToast(`${wasName} saved! Great work 💪`);
  location.hash = 'history';
}

function continueSummaryWorkout() {
  $('#workout-summary').style.display = 'none';
  $('#workout-active').style.display = 'flex';
  // Resume timer
  startWorkoutTimer();
}

// ─── Manage Exercises (Active Workout) ────────────────────────────────────────
function openManageExercisesModal() {
  const modal = $('#manage-ex-modal');
  if (modal) {
    modal.classList.add('active');
    renderManageExercisesList();
  }
}

function closeManageExercisesModal() {
  $('#manage-ex-modal')?.classList.remove('active');
}

function renderManageExercisesList() {
  const container = $('#manage-ex-list');
  if (!container || !state.workout) return;
  container.innerHTML = '';

  state.workout.exercises.forEach((ex, idx) => {
    const row = el('div', 'manage-ex-item');
    row.innerHTML = `
      <span class="manage-ex-name">${ex.name}</span>
      <div class="manage-ex-actions">
        <button class="manage-ex-btn" id="up-${idx}" title="Move up" ${idx === 0 ? 'disabled' : ''}>
          <i class="ti ti-arrow-up"></i>
        </button>
        <button class="manage-ex-btn" id="down-${idx}" title="Move down" ${idx === state.workout.exercises.length - 1 ? 'disabled' : ''}>
          <i class="ti ti-arrow-down"></i>
        </button>
        <button class="manage-ex-btn del" id="del-${idx}" title="Remove">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    `;

    row.querySelector(`#up-${idx}`).addEventListener('click', () => swapExercises(idx, idx - 1));
    row.querySelector(`#down-${idx}`).addEventListener('click', () => swapExercises(idx, idx + 1));
    row.querySelector(`#del-${idx}`).addEventListener('click', () => removeExerciseFromSession(idx));

    container.appendChild(row);
  });
}

function swapExercises(idx1, idx2) {
  const temp = state.workout.exercises[idx1];
  state.workout.exercises[idx1] = state.workout.exercises[idx2];
  state.workout.exercises[idx2] = temp;

  if (state.activeExerciseIdx === idx1) {
    state.activeExerciseIdx = idx2;
  } else if (state.activeExerciseIdx === idx2) {
    state.activeExerciseIdx = idx1;
  }

  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
  localStorage.setItem('activeExerciseIdx', state.activeExerciseIdx);

  renderManageExercisesList();
  renderWorkoutExercises();
}

async function removeExerciseFromSession(idx) {
  if (!confirm('Remove this exercise from current session?')) return;
  
  const ex = state.workout.exercises[idx];
  const sets = await db.sets.getByExercise(ex.id);
  const sessionSets = sets.filter(s => s.workoutId === state.workout.id);
  for (const s of sessionSets) {
    await db.sets.delete(s.id);
  }

  state.workout.exercises.splice(idx, 1);

  if (state.activeExerciseIdx >= state.workout.exercises.length) {
    state.activeExerciseIdx = Math.max(0, state.workout.exercises.length - 1);
  }

  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));
  localStorage.setItem('activeExerciseIdx', state.activeExerciseIdx);

  renderManageExercisesList();
  renderWorkoutExercises();
}

// ─── Exercise Picker Modal ────────────────────────────────────────────────────
async function openExercisePicker() {
  const modal = $('#ex-picker-modal');
  const searchEl = $('#ex-picker-search');
  const list = $('#ex-picker-list');
  modal.classList.add('active');
  searchEl.value = '';
  searchEl.focus();

  const exercises = await db.exercises.getAll();
  renderExPickerList(exercises, '');

  searchEl.oninput = () => renderExPickerList(exercises, searchEl.value.trim().toLowerCase());

  function renderExPickerList(exs, query) {
    const filtered = query ? exs.filter(e => e.name.toLowerCase().includes(query) || e.category.toLowerCase().includes(query)) : exs;
    list.innerHTML = '';
    filtered.forEach(ex => {
      const item = el('div', 'ex-pick-item');
      item.innerHTML = `
        <div class="lib-ex-cat-dot" style="background:${CAT_COLORS[ex.category]||'#aaa'}"></div>
        <div>
          <div class="ex-pick-name">${ex.name}</div>
          <div class="ex-pick-cat">${ex.category} · ${ex.muscles}</div>
        </div>`;
      item.addEventListener('click', () => {
        addExerciseToWorkout(ex);
        modal.classList.remove('active');
      });
      list.appendChild(item);
    });
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-title">No exercises found</div></div>`;
    }
  }
}

function closeExPickerModal() { $('#ex-picker-modal').classList.remove('active'); }

function addExerciseToWorkout(ex) {
  if (!state.workout) return;
  state.workout.exercises.push({ ...ex, sets: [{ weight: 0, reps: 0, done: false, isPR: false }] });
  
  localStorage.setItem('activeWorkout', JSON.stringify(state.workout));

  renderWorkoutExercises();
  
  const manageModal = $('#manage-ex-modal');
  if (manageModal && manageModal.classList.contains('active')) {
    renderManageExercisesList();
  }

  showToast(`${ex.name} added`);
}

// ─── Workout Name Edit ────────────────────────────────────────────────────────
function initWorkoutNameEdit() {
  const nameEl = $('#workout-name');
  if (!nameEl) return;
  nameEl.addEventListener('click', () => {
    const current = nameEl.textContent;
    const input = el('input', 'input');
    input.value = current;
    input.style.fontSize = '20px';
    input.style.fontWeight = '700';
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    function done() {
      state.workout.name = input.value.trim() || 'Workout';
      const span = el('span', '');
      span.id = 'workout-name';
      span.textContent = state.workout.name;
      span.style.cursor = 'pointer';
      initWorkoutNameEdit_el(span);
      input.replaceWith(span);
    }
    input.addEventListener('blur', done);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
  });
}
function initWorkoutNameEdit_el(el) {
  el.addEventListener('click', () => {
    const current = el.textContent;
    const input = document.createElement('input');
    input.className = 'input';
    input.value = current;
    input.style.fontSize = '20px';
    input.style.fontWeight = '700';
    el.replaceWith(input);
    input.focus();
    input.select();
    function done() {
      state.workout.name = input.value.trim() || 'Workout';
      const span = document.createElement('span');
      span.id = 'workout-name';
      span.textContent = state.workout.name;
      span.style.cursor = 'pointer';
      initWorkoutNameEdit_el(span);
      input.replaceWith(span);
    }
    input.addEventListener('blur', done);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
  });
}

// ─── History View ──────────────────────────────────────────────────────────────
async function renderHistory() {
  const container = $('#history-list');
  if (!container) return;
  container.innerHTML = '';

  const [workouts, allSets, exercises] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll(),
    db.exercises.getAll(),
  ]);

  // Only show completed workouts (not active ones)
  const completed = workouts.filter(w => w.status !== 'active');
  const sorted = [...completed].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Update badge
  const badge = $('#history-total-badge');
  if (badge) badge.textContent = `${sorted.length} workout${sorted.length !== 1 ? 's' : ''}`;

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" style="font-size:48px">📅</div>
        <div class="empty-state-title">No workouts yet</div>
        <div class="empty-state-sub">Complete your first workout to build your history</div>
      </div>`;
    return;
  }

  // Group by week
  const groups = {};
  sorted.forEach(w => {
    const ws = weekStart(new Date(w.date));
    if (!groups[ws]) groups[ws] = [];
    groups[ws].push(w);
  });

  Object.entries(groups).forEach(([weekKey, wks]) => {
    const groupEl = el('div', 'history-group fade-in');

    // Week label
    const wStart = new Date(weekKey);
    const wEnd = new Date(weekKey);
    wEnd.setDate(wEnd.getDate() + 6);
    const weekLabel = el('div', 'history-week-label');
    weekLabel.textContent = `${wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    groupEl.appendChild(weekLabel);

    wks.forEach(w => {
      const sets = allSets.filter(s => s.workoutId === w.id);
      const vol  = sets.reduce((a, s) => a + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);

      // Derive unique muscle categories from exercises used
      const usedExIds = [...new Set(sets.map(s => s.exerciseId))];
      const usedEx    = exercises.filter(e => usedExIds.includes(e.id));
      const cats      = [...new Set(usedEx.map(e => e.category))].slice(0, 4);

      // Count total reps
      const totalReps = sets.reduce((a, s) => a + (parseInt(s.reps) || 0), 0);

      const entry = el('div', 'history-entry-v2');

      entry.innerHTML = `
        <div class="history-v2-header">
          <div class="history-v2-icon">
            <i class="ti ti-barbell" style="font-size:20px;color:var(--accent)"></i>
          </div>
          <div class="history-v2-info">
            <div class="history-v2-name">${w.name || 'Workout'}</div>
            <div class="history-v2-date">${formatDate(w.date)}</div>
            <div class="history-v2-muscle-row">
              ${cats.map(c => `<span class="hist-muscle-chip" style="border-color:${CAT_COLORS[c] || '#555'};color:${CAT_COLORS[c] || '#aaa'}">${c}</span>`).join('')}
            </div>
          </div>
          <div class="history-v2-arrow">
            <i class="ti ti-chevron-right" style="font-size:18px;color:var(--text-muted)"></i>
          </div>
        </div>
        <div class="history-v2-stats">
          <div class="history-v2-stat">
            <i class="ti ti-clock" style="font-size:13px"></i>
            <span>${formatTime(w.duration || 0)}</span>
          </div>
          <div class="history-v2-stat">
            <i class="ti ti-stack" style="font-size:13px"></i>
            <span>${sets.length} sets</span>
          </div>
          <div class="history-v2-stat">
            <i class="ti ti-refresh" style="font-size:13px"></i>
            <span>${totalReps} reps</span>
          </div>
          <div class="history-v2-stat accent">
            <i class="ti ti-weight" style="font-size:13px"></i>
            <span>${Math.round(vol)} ${state.unit}</span>
          </div>
        </div>
      `;

      // Tap → open detail modal
      entry.addEventListener('click', () => openWorkoutDetail(w.id, allSets, exercises));

      groupEl.appendChild(entry);
    });

    container.appendChild(groupEl);
  });
}

async function openWorkoutDetail(workoutId, cachedSets, cachedExercises) {
  const modal   = $('#workout-detail-modal');
  const titleEl = $('#detail-modal-title');
  const dateEl  = $('#detail-modal-date');
  const statsEl = $('#detail-modal-stats');
  const bodyEl  = $('#detail-modal-body');
  if (!modal) return;

  const workout = await db.workouts.getById(workoutId);
  if (!workout) return;

  // ── Helper: reload sets from DB and re-render body ──
  async function reloadAndRender() {
    const liveSets     = await db.sets.getByWorkout(workoutId);
    const allExercises = cachedExercises ? cachedExercises : await db.exercises.getAll();
    renderDetailBody(liveSets, allExercises);
    renderDetailStats(liveSets);
  }

  // ── Helper: render stat pills ──
  function renderDetailStats(sets) {
    if (!statsEl) return;
    const vol       = sets.reduce((a, s) => a + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
    const totalReps = sets.reduce((a, s) => a + (parseInt(s.reps) || 0), 0);
    const exCount   = new Set(sets.map(s => s.exerciseId)).size;
    statsEl.innerHTML = `
      <span class="detail-stat-pill"><i class="ti ti-clock"></i> ${formatTime(workout.duration || 0)}</span>
      <span class="detail-stat-pill"><i class="ti ti-barbell"></i> ${exCount} exercise${exCount !== 1 ? 's' : ''}</span>
      <span class="detail-stat-pill"><i class="ti ti-stack"></i> ${sets.length} sets</span>
      <span class="detail-stat-pill"><i class="ti ti-refresh"></i> ${totalReps} reps</span>
      <span class="detail-stat-pill accent"><i class="ti ti-weight"></i> ${Math.round(vol)} ${workout.unit || state.unit}</span>
    `;
  }

  // ── Helper: render body (exercise blocks + set rows with edit/delete) ──
  function renderDetailBody(sets, exercises) {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    // Group sets by exercise
    const exGroups = {};
    sets.forEach(s => {
      if (!exGroups[s.exerciseId]) exGroups[s.exerciseId] = [];
      exGroups[s.exerciseId].push(s);
    });

    if (Object.keys(exGroups).length === 0) {
      bodyEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">No sets recorded.</div>';
    } else {
      Object.entries(exGroups).forEach(([exId, exSets]) => {
        const ex       = exercises.find(e => e.id === parseInt(exId));
        const exName   = ex ? ex.name     : 'Unknown Exercise';
        const exCat    = ex ? ex.category : '';
        const catColor = CAT_COLORS[exCat] || '#aaa';

        const block = el('div', 'detail-ex-block');

        // Exercise header
        const exHeader = el('div', 'detail-ex-header');
        exHeader.innerHTML = `
          <div class="lib-ex-cat-dot" style="background:${catColor}"></div>
          <span class="detail-ex-name">${exName}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:auto">${exCat}</span>
        `;
        block.appendChild(exHeader);

        // Sets table with edit/delete
        const table = el('table', 'sets-table');
        table.style.marginTop = '10px';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr>
          <th>Set</th>
          <th>${workout.unit || state.unit}</th>
          <th>Reps</th>
          <th style="color:var(--text-muted)">Vol</th>
          <th></th>
        </tr>`;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        exSets.forEach((s, i) => {
          const setVol = Math.round((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0));
          const tr = document.createElement('tr');
          tr.className = 'set-done';
          tr.dataset.setId = s.id;
          tr.innerHTML = `
            <td><span class="set-num done">${i + 1}</span></td>
            <td class="set-detail-weight"><strong>${s.weight}</strong></td>
            <td class="set-detail-reps"><strong>${s.reps}</strong></td>
            <td style="color:var(--text-muted);font-size:12px">${setVol} ${s.unit || state.unit}</td>
            <td style="white-space:nowrap">
              <button class="icon-btn set-detail-edit" title="Edit set" style="color:var(--accent);margin-right:4px"><i class="ti ti-edit"></i></button>
              <button class="icon-btn set-detail-del" title="Delete set" style="color:#ff4444"><i class="ti ti-trash"></i></button>
            </td>
          `;

          // Edit set button
          tr.querySelector('.set-detail-edit').addEventListener('click', () => {
            // Open weight picker first, then reps picker in callback
            openScrollPicker({
              min: 0, max: 300, step: 0.5,
              currentValue: parseFloat(s.weight) || 0,
              unit: workout.unit || state.unit,
              title: 'Edit Weight',
              callback: async (newWeight) => {
                openScrollPicker({
                  min: 1, max: 50, step: 1,
                  currentValue: parseInt(s.reps) || 1,
                  unit: 'reps',
                  title: 'Edit Reps',
                  callback: async (newReps) => {
                    s.weight = newWeight;
                    s.reps   = newReps;
                    await db.sets.update(s);
                    await reloadAndRender();
                    renderHistory();
                    showToast('Set updated ✅');
                  }
                });
              }
            });
          });

          // Delete set button
          tr.querySelector('.set-detail-del').addEventListener('click', async () => {
            if (!confirm('Delete this set?')) return;
            await db.sets.delete(s.id);
            await reloadAndRender();
            renderHistory();
            showToast('Set deleted');
          });

          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        block.appendChild(table);
        bodyEl.appendChild(block);
      });

      // Delete workout button at the bottom
      const delBtn = el('button', 'btn btn-danger btn-sm');
      delBtn.style.cssText = 'margin-top:20px;width:100%';
      delBtn.innerHTML = '<i class="ti ti-trash" style="font-size:14px"></i> Delete Workout';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this workout and all its sets?')) return;
        const allSets = await db.sets.getByWorkout(workoutId);
        for (const s of allSets) await db.sets.delete(s.id);
        await db.workouts.delete(workoutId);
        modal.classList.remove('active');
        showToast('Workout deleted');
        renderHistory();
        renderCalendar && renderCalendar();
      });
      bodyEl.appendChild(delBtn);
    }
  }

  // ── Editable date in header ──
  if (titleEl) titleEl.textContent = workout.name || 'Workout';
  if (dateEl) {
    // Replace plain text date with an inline date-picker
    const dateStr = workout.date ? new Date(workout.date).toISOString().split('T')[0] : '';
    dateEl.innerHTML = `<input type="date" id="detail-modal-date-picker" value="${dateStr}" style="background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:13px;cursor:pointer;padding:2px 4px">`;
    dateEl.querySelector('#detail-modal-date-picker')?.addEventListener('change', async (e) => {
      if (!e.target.value) return;
      workout.date = new Date(e.target.value + 'T12:00:00').toISOString();
      await db.workouts.update(workout);
      showToast('Date updated ✅');
      renderHistory();
      renderCalendar && renderCalendar();
    });
  }

  // Initial render
  const initialSets = cachedSets ? cachedSets.filter(s => s.workoutId === workoutId) : await db.sets.getByWorkout(workoutId);
  const initialExercises = cachedExercises ? cachedExercises : await db.exercises.getAll();
  renderDetailStats(initialSets);
  renderDetailBody(initialSets, initialExercises);

  modal.classList.add('active');
}

function closeWorkoutDetail() {
  $('#workout-detail-modal')?.classList.remove('active');
}


// ─── Library View ──────────────────────────────────────────────────────────────
async function renderLibrary() {
  const exercises = await db.exercises.getAll();
  renderLibraryList(exercises);
}

function renderLibraryList(exercises) {
  const container = $('#library-list');
  if (!container) return;

  const search = state.libSearch.toLowerCase();
  const filter = state.libFilter;

  const filtered = exercises.filter(ex => {
    const matchSearch = !search || ex.name.toLowerCase().includes(search) || ex.muscles.toLowerCase().includes(search);
    const matchFilter = filter === 'All' || ex.category === filter;
    return matchSearch && matchFilter;
  });

  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No exercises found</div></div>`;
    return;
  }
  filtered.forEach(ex => {
    const item = el('div', 'lib-ex-item fade-in');
    item.innerHTML = `
      <div class="lib-ex-cat-dot" style="background:${CAT_COLORS[ex.category]||'#aaa'}"></div>
      <div class="lib-ex-body">
        <div class="lib-ex-name">${ex.name}</div>
        <div class="lib-ex-muscles">${ex.muscles}</div>
      </div>
      <svg class="lib-ex-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
    item.addEventListener('click', () => openExercisePRModal(ex));
    container.appendChild(item);
  });
}

// Helper to create dark-themed line charts
function createProgressChart(canvasId, labels, data, labelName, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const existingChart = Chart.getChart(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }
  
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: labelName,
        data: data,
        borderColor: color,
        backgroundColor: color + '15', // light transparent glow
        borderWidth: 2,
        tension: 0.25,
        fill: true,
        pointRadius: labels.length > 15 ? 0 : 3,
        pointBackgroundColor: color,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#141414',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'var(--border)',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.parsed.y} ${labelName.includes('Weight') || labelName.includes('1RM') || labelName.includes('Volume') ? state.unit : ''}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#1a1a1a' },
          ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
        },
        y: {
          grid: { color: '#1a1a1a' },
          ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
        }
      }
    }
  });
}

async function openExercisePRModal(ex) {
  const modal = $('#pr-modal');
  if (!modal) return;
  state.currentPRExercise = ex; // store for re-render on range change
  $('#pr-modal-title').textContent = ex.name;
  $('#pr-modal-subtitle').textContent = `${ex.category} · ${ex.muscles || ''}`;
  
  const [workouts, allSets] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll()
  ]);
  
  const completed = workouts.filter(w => w.status !== 'active');
  const exSets = allSets.filter(s => s.exerciseId === ex.id && s.done && completed.some(w => w.id === s.workoutId));
  
  let maxWeight = 0;
  let bestSetVol = 0;
  let bestSetText = '—';
  let totalVolumeAllTime = 0;
  
  exSets.forEach(s => {
    const weight = parseFloat(s.weight) || 0;
    const reps = parseInt(s.reps) || 0;
    const vol = weight * reps;
    totalVolumeAllTime += vol;
    
    if (weight > maxWeight) maxWeight = weight;
    if (vol > bestSetVol) {
      bestSetVol = vol;
      bestSetText = `${weight} × ${reps}`;
    }
  });
  
  $('#pr-best-weight').textContent = maxWeight > 0 ? `${maxWeight}${state.unit}` : '—';
  $('#pr-best-set').textContent = bestSetText;
  $('#pr-best-vol').textContent = totalVolumeAllTime > 0 ? `${Math.round(bestSetVol)}${state.unit}` : '—';
  
  // Group sets by workout session date
  const sessions = {};
  exSets.forEach(s => {
    const w = completed.find(w => w.id === s.workoutId);
    if (!w) return;
    const key = dateKey(new Date(w.date));
    if (!sessions[key]) sessions[key] = [];
    sessions[key].push(s);
  });
  
  const sortedDates = Object.keys(sessions).sort((a, b) => new Date(a) - new Date(b));
  
  const chartLabels = [];
  const maxWeightData = [];
  const volumeData = [];
  const onermData = [];
  
  sortedDates.forEach(dStr => {
    const sessionSets = sessions[dStr];
    const d = new Date(dStr);
    chartLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    // Max weight
    const maxW = Math.max(...sessionSets.map(s => parseFloat(s.weight) || 0));
    maxWeightData.push(maxW);
    
    // Session volume
    const vol = sessionSets.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);
    volumeData.push(vol);
    
    // Est. 1RM
    const onerms = sessionSets.map(s => {
      const w = parseFloat(s.weight) || 0;
      const r = parseInt(s.reps) || 0;
      return w * (1 + r / 30);
    });
    onermData.push(Math.round(Math.max(...onerms)));
  });

  // Destroy existing charts to prevent memory leak/glitch
  ['chart-ex-max-weight', 'chart-ex-volume', 'chart-ex-onerm'].forEach(id => {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
  });

  const renderExChart = (canvasId, label, dataList, color) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    // Remove any existing message overlays first
    const existingMsg = canvas.parentElement.querySelector('.chart-msg-overlay');
    if (existingMsg) existingMsg.remove();
    
    if (dataList.length === 0) {
      const msg = el('div', 'chart-msg-overlay', 'No sessions logged yet');
      msg.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:12px; font-family:Inter, sans-serif;';
      canvas.parentElement.appendChild(msg);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    
    if (dataList.length === 1) {
      const msg = el('div', 'chart-msg-overlay', 'Log more sessions to see your progression');
      msg.style.cssText = 'position:absolute; bottom:8px; left:0; right:0; text-align:center; color:var(--text-muted); font-size:10px; font-weight:500; font-family:Inter, sans-serif; pointer-events:none;';
      canvas.parentElement.appendChild(msg);
    }
    
    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: label,
          data: dataList,
          borderColor: color,
          backgroundColor: color.replace('1)', '0.06)'),
          borderWidth: 2.5,
          tension: 0.25,
          fill: true,
          pointRadius: 5,
          pointBackgroundColor: color,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#141414',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'var(--border)',
            borderWidth: 1,
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
          },
          y: {
            grid: { color: '#1a1a1a' },
            ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
          }
        }
      }
    });
  };

  renderExChart('chart-ex-max-weight', `Max Weight (${state.unit})`, maxWeightData, 'rgba(200, 255, 0, 1)');
  renderExChart('chart-ex-volume', `Volume (${state.unit})`, volumeData, 'rgba(0, 200, 255, 1)');
  renderExChart('chart-ex-onerm', `Est. 1RM (${state.unit})`, onermData, 'rgba(234, 179, 8, 1)');

  // Append remove option if custom
  const body = $('#pr-modal-body');
  const existingDel = $('#ex-del-btn-wrap');
  if (existingDel) existingDel.remove();
  
  if (ex.category === 'Custom') {
    const wrap = el('div', '', `<button class="btn btn-danger btn-sm" id="ex-del-btn" style="width:100%; margin-top:20px"><i class="ti ti-trash" style="font-size:14px"></i> Remove Custom Exercise</button>`);
    wrap.id = 'ex-del-btn-wrap';
    wrap.querySelector('#ex-del-btn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this custom exercise? This won\'t delete past sets, but it removes it from picker.')) return;
      await db.exercises.delete(ex.id);
      modal.classList.remove('active');
      showToast(`${ex.name} removed`);
      renderLibrary();
    });
    body.appendChild(wrap);
  }
  
  // Show modal
  modal.classList.add('active');
}

function closePRModal() { $('#pr-modal').classList.remove('active'); }

async function openAddExerciseModal() {
  const modal = $('#add-ex-modal');
  modal.classList.add('active');
  $('#new-ex-name').value = '';
  $('#new-ex-muscles').value = '';
  $('#new-ex-cat').value = 'Push';
}
function closeAddExModal() { $('#add-ex-modal').classList.remove('active'); }

async function saveNewExercise() {
  const name = $('#new-ex-name').value.trim();
  const muscles = $('#new-ex-muscles').value.trim() || 'Various';
  const category = $('#new-ex-cat').value;
  if (!name) { showToast('Please enter a name'); return; }
  await db.exercises.add({ name, muscles, category: 'Custom', muscles });
  closeAddExModal();
  showToast(`${name} added to library`);
  renderLibrary();
}

// ─── Weight View ───────────────────────────────────────────────────────────────
async function renderWeightView() {
  const dateInput = $('#wt-date');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const logs = await db.weightLogs.getAll();
  const sorted = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Update stats
  if (sorted.length > 0) {
    const weights = sorted.map(l => l.weight);
    const current = weights[weights.length - 1];
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    $('#wt-current').textContent = `${current}${state.unit}`;
    $('#wt-min').textContent = `${min}${state.unit}`;
    $('#wt-max').textContent = `${max}${state.unit}`;

    // Trend
    if (sorted.length >= 2) {
      const recent = sorted.slice(-7).map(l => l.weight);
      const trend = recent[recent.length - 1] - recent[0];
      $('#wt-trend').textContent = `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}${state.unit}`;
      $('#wt-trend').style.color = trend <= 0 ? 'var(--success)' : 'var(--danger)';
    } else {
      $('#wt-trend').textContent = '—';
    }
  } else {
    $('#wt-current').textContent = '—';
    $('#wt-min').textContent = '—';
    $('#wt-max').textContent = '—';
    $('#wt-trend').textContent = '—';
  }

  // Render Weight Chart
  const activeRangeTab = $('#weight-chart-range-tabs .seg-tab.active');
  const range = activeRangeTab ? activeRangeTab.dataset.range : 'monthly';
  renderWeightChartJS(sorted, range);

  // Log list
  const list = $('#weight-log-list');
  if (list) {
    list.innerHTML = '';
    [...sorted].reverse().slice(0, 20).forEach(entry => {
      const item = el('div', 'weight-log-item fade-in');
      item.innerHTML = `
        <span class="weight-log-date">${formatDate(entry.date)}</span>
        <span class="weight-log-val">${entry.weight} ${state.unit}</span>
        <button class="weight-log-del" data-id="${entry.id}">✕</button>`;
      item.querySelector('.weight-log-del').addEventListener('click', async () => {
        await db.weightLogs.delete(entry.id);
        showToast('Entry removed');
        renderWeightView();
      });
      list.appendChild(item);
    });
    if (sorted.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚖️</div><div class="empty-state-title">No entries yet</div><div class="empty-state-sub">Log your weight above to start tracking</div></div>`;
    }
  }

  // Pre-fill and auto-calculate BMI from profile if available
  const profile = JSON.parse(localStorage.getItem('profile') || '{}');
  const bmiHeightInput = $('#bmi-height');
  const bmiWeightBtn = $('#bmi-weight-btn');
  if (bmiHeightInput && bmiWeightBtn) {
    if (!bmiHeightInput.value && profile.height) {
      bmiHeightInput.value = profile.height;
    }
    if (!bmiWeightBtn.dataset.val && (profile.weight || (sorted.length > 0 && sorted[sorted.length - 1].weight))) {
      const wVal = profile.weight || sorted[sorted.length - 1].weight;
      bmiWeightBtn.dataset.val = wVal;
      bmiWeightBtn.textContent = `${wVal} kg`;
    }
    const bmiWeightVal = parseFloat(bmiWeightBtn.dataset.val);
    if (bmiHeightInput.value && bmiWeightVal) {
      calculateBMI();
    }
  }
}

function getWeightLogsForRange(sortedLogs, range) {
  const now = new Date();
  let cutOffDate = new Date();
  
  if (range === 'weekly') {
    cutOffDate.setDate(now.getDate() - 7);
  } else if (range === 'monthly') {
    cutOffDate.setDate(now.getDate() - 30);
  } else if (range === 'yearly') {
    cutOffDate.setDate(now.getDate() - 365);
  }
  
  return sortedLogs.filter(l => new Date(l.date) >= cutOffDate);
}

function renderWeightChartJS(sortedLogs, range = 'monthly') {
  const canvasId = 'weight-chart';
  const rangeLogs = getWeightLogsForRange(sortedLogs, range);
  
  const labels = rangeLogs.map(l => {
    const d = new Date(l.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const data = rangeLogs.map(l => l.weight);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const existingChart = Chart.getChart(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }
  
  if (rangeLogs.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#777';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data for this period', canvas.width / (2 * devicePixelRatio || 2), canvas.height / (2 * devicePixelRatio || 2));
    return;
  }
  
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `Weight (${state.unit})`,
        data: data,
        borderColor: '#00c8ff', // cyan for weight
        backgroundColor: 'rgba(0, 200, 255, 0.06)',
        borderWidth: 2.5,
        tension: 0.25,
        fill: true,
        pointRadius: rangeLogs.length > 20 ? 0 : 3.5,
        pointBackgroundColor: '#00c8ff',
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#141414',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'var(--border)',
          borderWidth: 1,
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
        },
        y: {
          grid: { color: '#1a1a1a' },
          ticks: { color: '#777', font: { family: 'Inter', size: 9 } }
        }
      }
    }
  });
}

async function logWeight() {
  const btn = $('#wt-input-btn');
  const val = btn ? parseFloat(btn.dataset.val) : 0;
  if (!val || val <= 0) { showToast('Please select a weight first'); return; }

  const dateInput = $('#wt-date');
  let chosenDateString = new Date().toISOString();
  if (dateInput && dateInput.value) {
    chosenDateString = new Date(dateInput.value + 'T12:00:00').toISOString();
  }

  await db.weightLogs.add({ weight: val, date: chosenDateString, unit: state.unit });
  if (btn) {
    btn.dataset.val = '';
    btn.textContent = 'Select weight';
  }
  showToast(`${val} ${state.unit} logged!`);
  renderWeightView();
}

function setUnit(u) {
  state.unit = u;
  localStorage.setItem('unit', u);
  $$('.unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.unit === u));
  if (state.view === 'progress') renderProgress();
  if (state.view === 'profile') renderProfile();
  if (state.view === 'home') renderDashboard();
}

// ─── BMI Calculator ──────────────────────────────────────────────────────────
function calculateBMI() {
  const heightInput = $('#bmi-height');
  const weightBtn = $('#bmi-weight-btn');
  const resultPanel = $('#bmi-result-panel');
  const scoreVal = $('#bmi-score-val');
  const classification = $('#bmi-classification');
  const pin = $('#bmi-indicator-pin');
  
  if (!heightInput || !weightBtn || !resultPanel) return;
  
  const height = parseFloat(heightInput.value);
  const weight = parseFloat(weightBtn.dataset.val);
  
  if (!height || height <= 0 || !weight || weight <= 0) {
    showToast('Select height and weight first!');
    return;
  }
  
  // BMI = weight(kg) / height(m)^2
  const bmi = weight / ((height / 100) ** 2);
  scoreVal.textContent = bmi.toFixed(1);
  
  let cls = 'Normal Weight';
  let color = 'var(--success)';
  let bg = 'rgba(34, 197, 94, 0.15)';
  
  if (bmi < 18.5) {
    cls = 'Underweight';
    color = '#3b82f6'; // blue
    bg = 'rgba(59, 130, 246, 0.15)';
  } else if (bmi >= 18.5 && bmi < 25) {
    cls = 'Normal Weight';
    color = 'var(--success)'; // green
    bg = 'rgba(34, 197, 94, 0.15)';
  } else if (bmi >= 25 && bmi < 30) {
    cls = 'Overweight';
    color = '#eab308'; // orange/yellow
    bg = 'rgba(234, 179, 8, 0.15)';
  } else {
    cls = 'Obese';
    color = '#ef4444'; // red
    bg = 'rgba(239, 68, 68, 0.15)';
  }
  
  classification.textContent = cls;
  classification.style.color = color;
  classification.style.background = bg;
  
  // Map BMI 15-35 to 0%-100%
  const percent = Math.min(97, Math.max(3, ((bmi - 15) / 20) * 100));
  pin.style.left = `${percent}%`;
  
  resultPanel.style.display = 'flex';
}

// ─── Templates ────────────────────────────────────────────────────────────────
async function openTemplatesModal() {
  const modal = $('#templates-modal');
  modal.classList.add('active');
  await renderTemplatesList();
}

function closeTemplatesModal() { $('#templates-modal').classList.remove('active'); }

async function renderTemplatesList() {
  const list = $('#templates-list');
  if (!list) return;
  const templates = await db.templates.getAll();
  list.innerHTML = '';
  if (templates.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">No templates yet</div><div class="empty-state-sub">Save your current workout as a template below.</div></div>`;
  } else {
    templates.forEach(t => {
      const item = el('div', 'template-item');
      item.innerHTML = `
        <div class="template-icon">📋</div>
        <div class="template-body">
          <div class="template-name">${t.name}</div>
          <div class="template-meta">${(t.exercises||[]).length} exercise${(t.exercises||[]).length!==1?'s':''}</div>
        </div>
        <button class="template-del" data-id="${t.id}">✕</button>`;
      item.querySelector('.template-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        await db.templates.delete(t.id);
        await renderTemplatesList();
        renderDashboard();
      });
      item.addEventListener('click', async () => {
        closeTemplatesModal();
        await startWorkoutFromTemplate(t);
      });
      list.appendChild(item);
    });
  }
}

async function saveWorkoutAsTemplate() {
  if (!state.workout || state.workout.exercises.length === 0) {
    showToast('Add exercises first');
    return;
  }
  const name = state.workout.name || 'My Template';
  await db.templates.add({
    name,
    exercises: state.workout.exercises.map(e => e.id),
  });
  showToast(`Template "${name}" saved!`);
  renderDashboard();
}

// ─── PR Table Syncing ────────────────────────────────────────────────────────
async function syncAllPRs() {
  const [workouts, allSets] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll()
  ]);

  const completed = workouts.filter(w => w.status !== 'active');
  const completedIds = completed.map(w => w.id);

  // Clear current prs to rebuild
  await db.prs.clear();

  const prs = {};

  allSets.forEach(s => {
    if (!s.done || !completedIds.includes(s.workoutId)) return;
    const w = completed.find(x => x.id === s.workoutId);
    if (!w) return;

    const exId = s.exerciseId;
    const weight = parseFloat(s.weight) || 0;
    const reps = parseInt(s.reps) || 0;
    const vol = weight * reps;
    const date = w.date;

    if (!prs[exId]) {
      prs[exId] = {
        id: exId,
        exerciseId: exId,
        maxWeight: weight,
        maxWeightDate: date,
        maxReps: reps,
        maxRepsDate: date,
        maxVolume: vol,
        maxVolumeDate: date
      };
    } else {
      const p = prs[exId];
      if (weight > p.maxWeight) {
        p.maxWeight = weight;
        p.maxWeightDate = date;
      }
      if (reps > p.maxReps) {
        p.maxReps = reps;
        p.maxRepsDate = date;
      }
      if (vol > p.maxVolume) {
        p.maxVolume = vol;
        p.maxVolumeDate = date;
      }
    }
  });

  for (const exId in prs) {
    await db.prs.add(prs[exId]);
  }
}

// ─── Progress View ────────────────────────────────────────────────────────────
function renderProgress() {
  // Show active tab
  $$('#progress-tabs .seg-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.progressTab);
  });
  $$('.prog-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `prog-${state.progressTab}`);
  });

  if (state.progressTab === 'weight') {
    renderWeightView();
  } else if (state.progressTab === 'prs') {
    renderPRList();
  } else if (state.progressTab === 'library') {
    renderLibrary();
  }
}

async function renderPRList() {
  const container = $('#pr-list');
  if (!container) return;
  container.innerHTML = '';

  const [prs, exercises] = await Promise.all([
    db.prs.getAll(),
    db.exercises.getAll()
  ]);

  if (prs.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">No PRs recorded yet</div><div class="empty-state-sub">Log sets in workouts to see your Personal Records here</div></div>`;
    return;
  }

  // Sort PRs by max volume descending
  const sortedPRs = [...prs].sort((a, b) => b.maxVolume - a.maxVolume);

  sortedPRs.forEach((pr, idx) => {
    const ex = exercises.find(e => e.id === pr.exerciseId);
    if (!ex) return;

    const card = el('div', 'pr-card fade-in');
    card.innerHTML = `
      <div class="pr-card-rank">#${idx + 1}</div>
      <div class="pr-card-body">
        <div class="pr-card-name">${ex.name}</div>
        <div class="pr-card-meta">${ex.category} · Max Weight: ${pr.maxWeight}${state.unit}</div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:2px">Achieved: ${formatDate(pr.maxVolumeDate)}</div>
      </div>
      <div class="pr-card-val">
        <div>Best Vol: ${Math.round(pr.maxVolume)} ${state.unit}</div>
        <div style="font-size: 11px; color: var(--accent); font-weight: 700">Most Reps: ${pr.maxReps}</div>
      </div>
    `;
    card.addEventListener('click', () => openExercisePRModal(ex));
    container.appendChild(card);
  });
}

// ─── Profile View ─────────────────────────────────────────────────────────────
async function renderProfile() {
  const nameDisplay = $('#profile-name-display');
  const goalDisplay = $('#profile-goal-display');
  const ageDisplay = $('#profile-age-display');
  const heightDisplay = $('#profile-height-display');
  const weightDisplay = $('#profile-weight-display');
  
  const profile = JSON.parse(localStorage.getItem('profile') || '{}');

  if (nameDisplay) nameDisplay.textContent = profile.name || localStorage.getItem('username') || 'Athlete';
  if (goalDisplay) goalDisplay.textContent = `Goal: ${profile.goal || localStorage.getItem('fitnessGoal') || 'Build Muscle'}`;
  if (ageDisplay) ageDisplay.textContent = profile.age ? `${profile.age} yrs` : (localStorage.getItem('age') ? `${localStorage.getItem('age')} yrs` : '—');
  if (heightDisplay) heightDisplay.textContent = profile.height ? `${profile.height} cm` : (localStorage.getItem('height') ? `${localStorage.getItem('height')} cm` : '—');
  if (weightDisplay) weightDisplay.textContent = profile.weight ? `${profile.weight} kg` : (localStorage.getItem('weight') ? `${localStorage.getItem('weight')} kg` : '—');

  const [workouts, allSets] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll()
  ]);

  const completed = workouts.filter(w => w.status !== 'active');
  const totalWorkouts = completed.length;
  const totalSets = allSets.filter(s => s.done).length;
  const totalVol = allSets.filter(s => s.done).reduce((acc, s) => acc + ((parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0)), 0);

  $('#prof-total-workouts').textContent = totalWorkouts;
  $('#prof-total-sets').textContent = totalSets;
  
  if (totalVol >= 1000000) {
    $('#prof-total-vol').textContent = `${(totalVol / 1000000).toFixed(1)}M ${state.unit}`;
  } else if (totalVol >= 1000) {
    $('#prof-total-vol').textContent = `${(totalVol / 1000).toFixed(0)}k ${state.unit}`;
  } else {
    $('#prof-total-vol').textContent = `${totalVol} ${state.unit}`;
  }

  const streaks = calculateStreaks(completed);
  $('#prof-streak').textContent = `${streaks.current} / ${streaks.longest}🔥`;

  $('#rest-dur-display').textContent = `${state.restDuration}s`;

  $$('.settings-row .unit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === state.unit);
  });
  
  // Render recovery panel
  renderMuscleRecovery();
}

async function renderMuscleRecovery() {
  const list = $('#recovery-indicators-list');
  if (!list) return;
  list.innerHTML = '';
  
  const [workouts, allSets, exercises] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll(),
    db.exercises.getAll()
  ]);
  
  const completed = workouts.filter(w => w.status !== 'active');
  
  // Muscle groups we want to track
  const trackedMuscles = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Abs', 'Glutes', 'Forearms'];
  
  const now = new Date();
  const lastTrained = {};
  
  completed.forEach(w => {
    const wSets = allSets.filter(s => s.workoutId === w.id && s.done);
    if (wSets.length === 0) return;
    
    wSets.forEach(s => {
      const ex = exercises.find(e => e.id === s.exerciseId);
      if (!ex) return;
      
      const muscles = (ex.muscles || '').split(',').map(m => m.trim());
      muscles.forEach(m => {
        trackedMuscles.forEach(tm => {
          if (m.toLowerCase().includes(tm.toLowerCase()) || (ex.category && ex.category.toLowerCase().includes(tm.toLowerCase()))) {
            const wDate = new Date(w.date);
            if (!lastTrained[tm] || wDate > lastTrained[tm]) {
              lastTrained[tm] = wDate;
            }
          }
        });
      });
    });
  });
  
  trackedMuscles.forEach(muscle => {
    const lastTime = lastTrained[muscle];
    let statusText = 'Recovered';
    let percent = 100;
    let color = 'var(--success)';
    let remainingText = '';
    
    if (lastTime) {
      const hoursElapsed = (now - lastTime) / (1000 * 60 * 60);
      if (hoursElapsed < 48) {
        percent = Math.min(100, Math.max(0, (hoursElapsed / 48) * 100));
        const hoursLeft = Math.ceil(48 - hoursElapsed);
        statusText = 'Recovering';
        color = '#eab308'; // orange/yellow
        remainingText = `${hoursLeft}h remaining`;
      }
    }
    
    const row = el('div', 'recovery-row', `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:4px">
        <span style="font-weight:700">${muscle}</span>
        <span style="font-weight:700; color:${color}">${statusText} ${remainingText ? `(${remainingText})` : ''}</span>
      </div>
      <div style="height:6px; background:var(--card-2); border-radius:3px; overflow:hidden">
        <div style="width:${percent}%; height:100%; background:${color}; border-radius:3px; transition:width 0.5s ease"></div>
      </div>
    `);
    list.appendChild(row);
  });
}

function calculateStreaks(workouts) {
  if (workouts.length === 0) return { current: 0, longest: 0 };
  
  const dates = [...new Set(workouts.map(w => dateKey(new Date(w.date))))].sort((a, b) => new Date(a) - new Date(b));
  
  let longest = 0;
  let current = 0;
  let running = 0;
  let prevDate = null;
  
  dates.forEach(dStr => {
    const d = new Date(dStr);
    if (prevDate === null) {
      running = 1;
    } else {
      const diffTime = d - prevDate;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 1) {
        running++;
      } else {
        if (running > longest) longest = running;
        running = 1;
      }
    }
    prevDate = d;
  });
  if (running > longest) longest = running;
  
  // Calculate current streak
  const today = dateKey();
  const yesterday = dateKey(new Date(Date.now() - 86400000));
  const sortedDesc = [...dates].sort((a, b) => new Date(b) - new Date(a));
  
  if (sortedDesc[0] === today || sortedDesc[0] === yesterday) {
    let checkDate = new Date(sortedDesc[0]);
    let streak = 0;
    while (true) {
      const key = dateKey(checkDate);
      if (dates.includes(key)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    current = streak;
  } else {
    current = 0;
  }
  
  // Persist longest streak
  const storedLongest = parseInt(localStorage.getItem('longestStreak')) || 0;
  if (longest > storedLongest) {
    localStorage.setItem('longestStreak', longest);
  } else {
    longest = Math.max(longest, storedLongest);
  }
  
  return { current, longest };
}

function changeDefaultRest(amount) {
  state.restDuration = Math.max(15, state.restDuration + amount);
  localStorage.setItem('restDuration', state.restDuration);
  const display = $('#rest-dur-display');
  if (display) display.textContent = `${state.restDuration}s`;
}

async function exportData() {
  // Show loading state on button
  const btn = $('#export-data-btn');
  const origInner = btn ? btn.innerHTML : '';
  if (btn) {
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';
    const iconEl = btn.querySelector('.ti-download');
    if (iconEl) iconEl.className = 'ti ti-loader-2 ti-spin';
  }

  try {
    const [workouts, allSets, exercises, weightLogs, prs, templates] = await Promise.all([
      db.workouts.getAll(),
      db.sets.getAll(),
      db.exercises.getAll(),
      db.weightLogs.getAll(),
      db.prs ? db.prs.getAll() : Promise.resolve([]),
      db.templates.getAll()
    ]);

    const profile = JSON.parse(localStorage.getItem('profile') || '{}');
    const todayStr = new Date().toISOString().split('T')[0];

    // ── Build nested workouts structure ──────────────────────────────────────
    const completedWorkouts = workouts
      .filter(w => w.status !== 'active')
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const structuredWorkouts = completedWorkouts.map(w => {
      const workoutSets = allSets.filter(s => s.workoutId === w.id);

      // Group by exercise
      const exMap = {};
      workoutSets.forEach(s => {
        if (!exMap[s.exerciseId]) exMap[s.exerciseId] = [];
        exMap[s.exerciseId].push(s);
      });

      const exercisesData = Object.entries(exMap).map(([exId, exSets]) => {
        const ex = exercises.find(e => e.id === parseInt(exId));
        return {
          name:     ex ? ex.name     : `Exercise #${exId}`,
          category: ex ? ex.category : 'Unknown',
          sets: exSets.map(s => ({
            weight: parseFloat(s.weight) || 0,
            reps:   parseInt(s.reps)    || 0,
            unit:   s.unit || state.unit,
            done:   s.done || false
          }))
        };
      });

      return {
        date:      new Date(w.date).toISOString().split('T')[0],
        time:      new Date(w.date).toTimeString().slice(0, 5),
        name:      w.name || 'Workout',
        duration:  w.duration || 0,
        unit:      w.unit || state.unit,
        exercises: exercisesData
      };
    });

    // ── Personal Records ─────────────────────────────────────────────────────
    const structuredPRs = prs.map(pr => {
      const ex = exercises.find(e => e.id === pr.exerciseId);
      return {
        exercise:  ex ? ex.name : `Exercise #${pr.exerciseId}`,
        maxWeight: pr.maxWeight || 0,
        bestSet:   pr.bestSet   || null,
        estimated1RM: pr.maxWeight ? parseFloat((pr.maxWeight * (1 + (pr.bestSet?.reps || 1) / 30)).toFixed(1)) : null,
        date:      pr.date ? new Date(pr.date).toISOString().split('T')[0] : null
      };
    });

    // ── Weight Log ───────────────────────────────────────────────────────────
    const structuredWeightLog = weightLogs
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(l => ({
        date:   new Date(l.date).toISOString().split('T')[0],
        weight: l.weight,
        unit:   l.unit || state.unit
      }));

    // ── Templates ────────────────────────────────────────────────────────────
    const structuredTemplates = templates.map(t => ({
      name:      t.name,
      muscles:   t.muscles || [],
      exercises: (t.exercises || []).map(exId => {
        const ex = exercises.find(e => e.id === exId);
        return ex ? ex.name : `Exercise #${exId}`;
      })
    }));

    // ── Final export object ──────────────────────────────────────────────────
    const exportPayload = {
      exportDate: todayStr,
      appVersion: 'GymTracker v1.0',
      profile: {
        name:   profile.name   || localStorage.getItem('username') || '',
        age:    profile.age    || null,
        height: profile.height || null,
        weight: profile.weight || null,
        goal:   profile.goal   || ''
      },
      summary: {
        totalWorkouts:    structuredWorkouts.length,
        totalSetsLogged:  allSets.length,
        totalWeightEntries: structuredWeightLog.length,
        personalRecords:  structuredPRs.length,
        templates:        structuredTemplates.length
      },
      workouts:        structuredWorkouts,
      weightLog:       structuredWeightLog,
      personalRecords: structuredPRs,
      templates:       structuredTemplates
    };

    const jsonStr  = JSON.stringify(exportPayload, null, 2);
    const blob     = new Blob([jsonStr], { type: 'application/json' });
    const filename = `gymtracker-export-${todayStr}.json`;

    // ── Download strategy: try anchor download, fall back to new tab on iOS ──
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS || isSafari) {
      // iOS Safari: open in new tab — user taps Share → Save to Files
      const url = URL.createObjectURL(blob);
      const newTab = window.open(url, '_blank');
      if (newTab) {
        showToast('📱 Tap Share → Save to Files to export');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        showToast('Allow pop-ups to export data');
      }
    } else {
      // Standard browsers: direct download
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`✅ Exported ${structuredWorkouts.length} workouts!`);
    }

  } catch (err) {
    console.error('Export failed:', err);
    showToast('Export failed — please try again');
  } finally {
    // Restore button
    if (btn) {
      btn.style.opacity    = '';
      btn.style.pointerEvents = '';
      if (origInner) btn.innerHTML = origInner;
    }
  }
}

// ─── Workout Setup Wizard Flow ────────────────────────────────────────────────
const MUSCLE_EXERCISES_MAP = {
  Chest: ['Bench Press', 'Incline Bench Press', 'Push-Ups', 'Dumbbell Chest Press', 'Incline Smith Press', 'Pec Deck', 'Reverse Pec Deck', 'Incline Dumbbell Fly'],
  Back: ['Pull-Ups', 'Barbell Row', 'Dumbbell Row', 'Lat Pulldown', 'Seated Cable Row', 'T-Bar Row', 'Deadlift', 'Lat Pullover (Dumbbell)', 'Lat Pullover (Cable)', 'Straight Arm Pulldown', 'Meadows Row'],
  Shoulders: ['Overhead Press', 'Dumbbell Shoulder Press', 'Lateral Raises', 'Face Pulls', 'Trap Shrugs (Barbell)', 'Trap Shrugs (Dumbbell)', 'Cable Lateral Raise', 'Machine Shoulder Press'],
  Biceps: ['Bicep Curl', 'Hammer Curl', 'Preacher Curl', 'Incline Curl', 'Spider Curl', 'Cable Hammer Curl'],
  Triceps: ['Tricep Dips', 'Tricep Pushdown'],
  Legs: ['Squat', 'Leg Press', 'Leg Extension', 'Leg Curl', 'Calf Raises', 'Hack Squat', 'Smith Machine Squat', 'Seated Calf Raise', 'Glute Kickback'],
  Abs: ['Plank', 'Crunches', 'Hanging Leg Raises', 'Cable Crunch'],
  Forearms: ['Wrist Curls', 'Reverse Curls'],
  Glutes: ['Hip Thrust', 'Romanian Deadlift'],
  'Full Body': ['Deadlift', 'Rowing Machine'],
  Cardio: ['Treadmill Run', 'Cycling', 'Rowing Machine']
};

const MUSCLE_ICONS = {
  Chest: 'ti-shield',
  Back: 'ti-compass',
  Shoulders: 'ti-triangle',
  Biceps: 'ti-user',
  Triceps: 'ti-bolt',
  Legs: 'ti-shoe',
  Abs: 'ti-grid-pattern',
  Forearms: 'ti-hand-grab',
  Glutes: 'ti-layers-intersect',
  'Full Body': 'ti-barbell',
  Cardio: 'ti-activity'
};

function renderSetupStep() {
  const step = state.setupStep;

  // Update step indicators
  const indicator = $('#setup-step-indicator');
  const progress = $('#setup-progress-bar');
  const title = $('#setup-step-title');

  if (indicator) indicator.textContent = `Step ${step} of 3`;
  if (progress) progress.style.width = `${(step / 3) * 100}%`;
  
  if (step === 1) {
    if (title) title.textContent = 'Select Muscle Groups';
    $('#setup-step-1').style.display = 'flex';
    $('#setup-step-2').style.display = 'none';
    $('#setup-step-3').style.display = 'none';
    renderStep1();
  } else if (step === 2) {
    if (title) title.textContent = 'Select Exercises';
    $('#setup-step-1').style.display = 'none';
    $('#setup-step-2').style.display = 'flex';
    $('#setup-step-3').style.display = 'none';
    renderStep2();
  } else if (step === 3) {
    if (title) title.textContent = 'Review Workout';
    $('#setup-step-1').style.display = 'none';
    $('#setup-step-2').style.display = 'none';
    $('#setup-step-3').style.display = 'flex';
    renderStep3();
  }

  updateSetupNavControls();
}

function renderStep1() {
  const grid = $('#muscle-groups-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const muscleGroups = Object.keys(MUSCLE_EXERCISES_MAP);
  muscleGroups.forEach(m => {
    const isSelected = state.setupSelectedMuscles.includes(m);
    const btn = el('button', `muscle-chip ${isSelected ? 'selected' : ''}`);
    btn.innerHTML = `
      <i class="ti ${MUSCLE_ICONS[m] || 'ti-barbell'}"></i>
      <span>${m}</span>
    `;
    btn.addEventListener('click', () => {
      if (state.setupSelectedMuscles.includes(m)) {
        state.setupSelectedMuscles = state.setupSelectedMuscles.filter(x => x !== m);
      } else {
        state.setupSelectedMuscles.push(m);
      }
      renderStep1();
      updateSetupNavControls();
    });
    grid.appendChild(btn);
  });
}

async function renderStep2() {
  const container = $('#exercises-select-lists');
  if (!container) return;
  container.innerHTML = '';

  const allExercises = await db.exercises.getAll();
  
  state.setupSelectedMuscles.forEach(muscleGroup => {
    const header = el('div', 'review-muscle-group-title');
    header.textContent = muscleGroup;
    container.appendChild(header);

    const allowedNames = MUSCLE_EXERCISES_MAP[muscleGroup] || [];
    const exercisesForGroup = allExercises.filter(e => allowedNames.includes(e.name));

    if (exercisesForGroup.length === 0) {
      const empty = el('div', '', 'No preloaded exercises found.');
      empty.style.fontSize = '13px';
      empty.style.color = 'var(--text-muted)';
      empty.style.paddingLeft = '4px';
      container.appendChild(empty);
      return;
    }

    exercisesForGroup.forEach(ex => {
      const isChecked = state.setupSelectedExercises.some(x => x.id === ex.id);
      const row = el('label', 'exercise-checkbox-row');
      row.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''} />
        <span class="exercise-checkbox-label">${ex.name}</span>
      `;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!state.setupSelectedExercises.some(x => x.id === ex.id)) {
            state.setupSelectedExercises.push(ex);
          }
        } else {
          state.setupSelectedExercises = state.setupSelectedExercises.filter(x => x.id !== ex.id);
        }
        updateSetupNavControls();
      });
      container.appendChild(row);
    });
  });
}

function renderStep3() {
  const container = $('#setup-review-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.setupSelectedExercises.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">No exercises selected</div></div>`;
    return;
  }

  // Group by muscle group
  state.setupSelectedMuscles.forEach(muscleGroup => {
    const groupExercises = state.setupSelectedExercises.filter(ex => {
      const allowed = MUSCLE_EXERCISES_MAP[muscleGroup] || [];
      return allowed.includes(ex.name);
    });

    if (groupExercises.length > 0) {
      const header = el('div', 'review-muscle-group-title');
      header.textContent = muscleGroup;
      container.appendChild(header);

      groupExercises.forEach(ex => {
        const item = el('div', 'review-exercise-item');
        item.innerHTML = `
          <i class="ti ti-activity" style="color:var(--accent); font-size:16px"></i>
          <span>${ex.name}</span>
        `;
        container.appendChild(item);
      });
    }
  });
}

function updateSetupNavControls() {
  const backBtn = $('#setup-back-btn');
  const nextBtn = $('#setup-next-btn');

  if (state.setupStep === 1) {
    if (backBtn) backBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.textContent = 'Next';
      nextBtn.disabled = state.setupSelectedMuscles.length === 0;
      nextBtn.className = 'btn btn-accent';
    }
  } else if (state.setupStep === 2) {
    if (backBtn) backBtn.style.display = 'block';
    if (nextBtn) {
      nextBtn.textContent = 'Next';
      nextBtn.disabled = state.setupSelectedExercises.length === 0;
      nextBtn.className = 'btn btn-accent';
    }
  } else if (state.setupStep === 3) {
    if (backBtn) backBtn.style.display = 'block';
    if (nextBtn) {
      nextBtn.textContent = 'Start Workout';
      nextBtn.disabled = state.setupSelectedExercises.length === 0;
      nextBtn.className = 'btn btn-accent';
    }
  }
}

function startNewWorkout() {
  state.setupStep = 1;
  state.setupSelectedMuscles = [];
  state.setupSelectedExercises = [];

  const backdateCheck = $('#backdate-workout-check');
  if (backdateCheck) backdateCheck.checked = false;
  
  const backdateWrap = $('#backdate-workout-picker-wrap');
  if (backdateWrap) backdateWrap.style.display = 'none';

  const backdatePicker = $('#backdate-workout-picker');
  if (backdatePicker) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    backdatePicker.value = `${yyyy}-${mm}-${dd}`;
  }

  const emptyEl = $('#workout-empty');
  const activeEl = $('#workout-active');
  const setupEl = $('#workout-setup');

  if (emptyEl) emptyEl.style.display = 'none';
  if (activeEl) activeEl.style.display = 'none';
  if (setupEl) setupEl.style.display = 'flex';

  renderSetupStep();
  location.hash = 'workout';
}

function cancelWorkoutSetup() {
  $('#workout-setup').style.display = 'none';
  $('#workout-active').style.display = 'none';
  $('#workout-empty').style.display = 'flex';
  state.setupStep = 1;
}

function goToNextSetupStep() {
  if (state.setupStep < 3) {
    state.setupStep++;
    renderSetupStep();
  } else {
    $('#workout-setup').style.display = 'none';
    const isBackdate = $('#backdate-workout-check')?.checked;
    const datePicker = $('#backdate-workout-picker');
    const chosenDate = (isBackdate && datePicker && datePicker.value) ? datePicker.value : dateKey();
    initiateWorkoutSession('Workout', state.setupSelectedExercises, null, chosenDate);
  }
}

function goToPrevSetupStep() {
  if (state.setupStep > 1) {
    state.setupStep--;
    renderSetupStep();
  }
}

// ─── PR Badge Animation ───────────────────────────────────────────────────────
function triggerPRAnimation() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed; top:50%; left:50%;
    transform:translate(-50%,-50%) scale(0.4);
    background:#C8FF00; color:#0a0a0a;
    padding:18px 32px; border-radius:24px;
    font-weight:900; font-size:22px; letter-spacing:-0.5px;
    box-shadow:0 12px 40px rgba(200,255,0,0.45);
    z-index:9999; opacity:0;
    transition:all 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
    text-align:center; pointer-events:none;
  `;
  overlay.innerHTML = '🏆 NEW RECORD! 🏆';
  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.transform = 'translate(-50%,-50%) scale(1)';
      overlay.style.opacity = '1';
    });
  });

  // Animate out
  setTimeout(() => {
    overlay.style.transform = 'translate(-50%,-50%) scale(0.85)';
    overlay.style.opacity = '0';
    overlay.style.transition = 'all 0.35s ease';
    setTimeout(() => overlay.remove(), 350);
  }, 1600);
}

// ─── Home Sub-Tabs ─────────────────────────────────────────────────────────────
let homeTab = 'dash'; // 'dash' | 'calendar' | 'stats'
let statsTimeRange = 'weekly'; // 'weekly' | 'monthly'
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function switchHomeTab(tab) {
  homeTab = tab;
  $$('#home-tabs .seg-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  
  const panels = { dash: $('#home-dash'), calendar: $('#home-calendar'), stats: $('#home-stats') };
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    el.style.display = key === tab ? 'flex' : 'none';
  });
  
  if (tab === 'calendar') renderCalendar();
  if (tab === 'stats') renderStatsDashboard();
}

// ─── Calendar Rendering ───────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

async function renderCalendar() {
  const grid = $('#calendar-grid');
  const monthTitle = $('#cal-month-title');
  if (!grid || !monthTitle) return;

  grid.innerHTML = '';

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  monthTitle.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1);
  let startDow = firstDay.getDay(); // 0 = Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // shift so Mon=0, Sun=6
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const [workouts, allSets] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll()
  ]);

  const completed = workouts.filter(w => w.status !== 'active');
  const todayStr = dateKey();

  // Build a map of date -> workouts
  const dayMap = {};
  completed.forEach(w => {
    const dk = dateKey(new Date(w.date));
    if (!dayMap[dk]) dayMap[dk] = [];
    dayMap[dk].push(w);
  });

  // Blank spacers
  for (let i = 0; i < startDow; i++) {
    const blank = el('div');
    blank.style.height = '48px';
    grid.appendChild(blank);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
    const dayWorkouts = dayMap[dateStr] || [];
    const isToday = dateStr === todayStr;

    const cell = el('div', 'cal-day-cell');
    cell.style.cssText = `
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:48px; border-radius:10px; cursor:pointer; padding:4px 2px;
      border:1px solid ${isToday ? 'var(--accent)' : 'var(--border)'};
      background:${isToday ? 'rgba(200,255,0,0.08)' : 'var(--card)'};
      transition:background 0.15s;
    `;

    const numEl = el('span');
    numEl.textContent = day;
    numEl.style.cssText = `font-size:13px; font-weight:${isToday ? '900' : '600'}; color:${isToday ? 'var(--accent)' : 'var(--text)'}`;
    cell.appendChild(numEl);

    // Dot
    if (dayWorkouts.length > 0) {
      const totalSets = allSets.filter(s => dayWorkouts.some(w => w.id === s.workoutId) && s.done).length;
      const dot = el('span');
      dot.style.cssText = `width:6px; height:6px; border-radius:50%; margin-top:4px; background:${totalSets >= 4 ? 'var(--success)' : '#eab308'}`;
      cell.appendChild(dot);
    } else {
      const spacer = el('span');
      spacer.style.cssText = 'width:6px; height:6px; margin-top:4px';
      cell.appendChild(spacer);
    }

    // Click: workout days open detail modal, rest days prompt to log
    cell.addEventListener('click', () => {
      if (dayWorkouts.length > 0) {
        // Open the detail modal for the first workout (most common case)
        openWorkoutDetail(dayWorkouts[0].id, allSets);
      } else {
        showCalendarDayDetail(dateStr, [], allSets);
      }
    });
    grid.appendChild(cell);
  }
}

function showCalendarDayDetail(dateStr, dayWorkouts, allSets) {
  const container = $('#cal-day-detail-container');
  if (!container) return;
  container.innerHTML = '';

  const d = new Date(dateStr);
  const formatted = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const label = el('div', 'section-label');
  label.style.paddingLeft = '0';
  label.textContent = formatted;
  container.appendChild(label);

  if (dayWorkouts.length === 0) {
    const card = el('div', 'card');
    card.style.padding = '18px 14px';
    card.innerHTML = `
      <div style="color:var(--text-muted);font-size:13px;margin-bottom:14px">🌙 Rest day — no workouts logged.</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">Log a past workout for this date?</div>
      <button id="cal-log-past-btn" class="btn btn-accent btn-sm" style="width:100%">+ Log Workout for ${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</button>
    `;
    card.querySelector('#cal-log-past-btn').addEventListener('click', () => {
      // Pre-fill the backdate picker and launch the workout wizard
      const backdateCheck = $('#backdate-workout-check');
      const backdatePicker = $('#backdate-workout-date');
      const pickerWrap = $('#backdate-workout-picker-wrap');
      if (backdateCheck) backdateCheck.checked = true;
      if (backdatePicker) backdatePicker.value = dateStr;
      if (pickerWrap) pickerWrap.style.display = 'block';
      navigate('home');
      // Slight delay to let the home view render, then open the new workout flow
      setTimeout(() => {
        const startBtn = $('#start-workout-btn') || $('[data-action="new-workout"]');
        if (startBtn) startBtn.click();
      }, 120);
    });
    container.appendChild(card);
    return;
  }

  dayWorkouts.forEach(w => {
    const wSets = allSets.filter(s => s.workoutId === w.id && s.done);
    const vol = wSets.reduce((sum, s) => sum + ((parseFloat(s.weight)||0)*(parseInt(s.reps)||0)), 0);
    const card = el('div', 'card');
    card.style.padding = '14px';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center">
        <div>
          <div style="font-size:15px; font-weight:800">${w.name || 'Workout'}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px">
            ⏱ ${formatTime(w.duration||0)} · 💪 ${wSets.length} sets · ⚖️ ${Math.round(vol)} ${state.unit}
          </div>
        </div>
        <button class="btn btn-accent btn-sm" style="width:auto;padding:6px 12px">Details</button>
      </div>`;
    card.querySelector('button').addEventListener('click', () => openWorkoutDetail(w.id, allSets));
    container.appendChild(card);
  });
}

// ─── Stats Dashboard ──────────────────────────────────────────────────────────
async function renderStatsDashboard() {
  const [workouts, allSets, exercises] = await Promise.all([
    db.workouts.getAll(),
    db.sets.getAll(),
    db.exercises.getAll()
  ]);

  const completed = workouts.filter(w => w.status !== 'active');
  const now = new Date();
  const rangeDays = statsTimeRange === 'weekly' ? 7 : 30;
  const cutOff = new Date();
  cutOff.setDate(now.getDate() - rangeDays);

  const rangeWorkouts = completed.filter(w => new Date(w.date) >= cutOff);
  const rangeIds = rangeWorkouts.map(w => w.id);
  const rangeSets = allSets.filter(s => rangeIds.includes(s.workoutId) && s.done);

  // Hours trained
  const totalSecs = rangeWorkouts.reduce((sum, w) => sum + (w.duration || 0), 0);
  const hours = (totalSecs / 3600).toFixed(1);

  // Volume
  const vol = rangeSets.reduce((sum, s) => sum + ((parseFloat(s.weight)||0)*(parseInt(s.reps)||0)), 0);
  const volStr = vol >= 1000 ? `${(vol/1000).toFixed(1)}k` : `${Math.round(vol)}`;

  // Consistency
  const uniqueDays = new Set(rangeWorkouts.map(w => dateKey(new Date(w.date)))).size;
  const consistency = Math.round((uniqueDays / rangeDays) * 100);

  // Most trained muscle (by category of sets)
  const catCount = {};
  rangeSets.forEach(s => {
    const ex = exercises.find(e => e.id === s.exerciseId);
    if (!ex) return;
    catCount[ex.category] = (catCount[ex.category] || 0) + 1;
  });
  const mostTrained = Object.entries(catCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

  // Strongest exercise (best all-time estimated 1RM)
  let strongestEx = '—';
  let best1RM = 0;
  allSets.filter(s => s.done).forEach(s => {
    const w = parseFloat(s.weight) || 0;
    const r = parseInt(s.reps) || 0;
    const orm = w * (1 + r / 30);
    if (orm > best1RM) {
      best1RM = orm;
      const ex = exercises.find(e => e.id === s.exerciseId);
      strongestEx = ex ? `${ex.name} (${Math.round(w)}${state.unit})` : '—';
    }
  });

  const streaks = calculateStreaks(completed);

  // Update DOM
  const safeSet = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  safeSet('#stats-workouts-count', rangeWorkouts.length);
  safeSet('#stats-hours-count', `${hours}h`);
  safeSet('#stats-sets-count', rangeSets.length);
  safeSet('#stats-vol-count', `${volStr} ${state.unit}`);
  safeSet('#stats-consistency', `${consistency}%`);
  safeSet('#stats-most-trained', mostTrained);
  safeSet('#stats-strongest-ex', strongestEx);
  safeSet('#stats-current-streak', `${streaks.current} day${streaks.current !== 1 ? 's' : ''}`);
  safeSet('#stats-longest-streak', `${streaks.longest} day${streaks.longest !== 1 ? 's' : ''}`);
}

// ─── iOS Install Banner ───────────────────────────────────────────────────────
function initIOSInstallBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const dismissed = localStorage.getItem('iosBannerDismissed');
  
  if (isIOS && !isStandalone && !dismissed) {
    const banner = $('#ios-install-banner');
    if (banner) {
      banner.style.display = 'flex';
      $('#ios-install-close')?.addEventListener('click', () => {
        banner.style.display = 'none';
        localStorage.setItem('iosBannerDismissed', '1');
      });
    }
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Register service worker and handle updates automatically
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
      // If there is already a waiting service worker, skip waiting
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Watch for new service workers installing
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });
    }).catch(console.warn);

    // Reload the page once the new service worker has activated and taken control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // Seed DB
  await db.seed();

  // Unit toggle init
  $$('.unit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === state.unit);
    btn.addEventListener('click', () => setUnit(btn.dataset.unit));
  });

  // Nav
  initNav();

  // Active chip click → go to workout
  $('#active-chip').addEventListener('click', () => { location.hash = 'workout'; });

  // Rest timer
  $('#rest-skip-btn').addEventListener('click', skipRest);
  const restPlus = $('#rest-plus');
  const restMinus = $('#rest-minus');
  if (restPlus) restPlus.addEventListener('click', () => { state.restRemaining = Math.min(state.restRemaining + 15, 300); updateRestRing(); });
  if (restMinus) restMinus.addEventListener('click', () => { state.restRemaining = Math.max(state.restRemaining - 15, 5); updateRestRing(); });

  // Workout view events
  $('#start-workout-btn-dash')?.addEventListener('click', startNewWorkout);
  $('#start-workout-btn-empty')?.addEventListener('click', startNewWorkout);
  $('#add-exercise-btn')?.addEventListener('click', openExercisePicker);
  $('#finish-workout-btn')?.addEventListener('click', finishWorkout);
  $('#ex-picker-close')?.addEventListener('click', closeExPickerModal);
  $('#save-template-btn')?.addEventListener('click', saveWorkoutAsTemplate);

  // Setup wizard buttons
  $('#setup-cancel-btn')?.addEventListener('click', cancelWorkoutSetup);
  $('#setup-next-btn')?.addEventListener('click', goToNextSetupStep);
  $('#setup-back-btn')?.addEventListener('click', goToPrevSetupStep);

  // Active workout new buttons
  $('#manage-exercises-btn')?.addEventListener('click', openManageExercisesModal);
  $('#manage-ex-close')?.addEventListener('click', closeManageExercisesModal);
  $('#manage-ex-add-btn')?.addEventListener('click', () => {
    closeManageExercisesModal();
    openExercisePicker();
  });
  $('#skip-exercise-btn')?.addEventListener('click', skipExercise);
  $('#active-add-set-btn')?.addEventListener('click', () => {
    if (state.workout) addSet(state.activeExerciseIdx);
  });
  $('#finish-exercise-btn')?.addEventListener('click', finishExercise);
  $('#prompt-next-ex-btn')?.addEventListener('click', handlePromptNextExercise);
  $('#prompt-end-workout-btn')?.addEventListener('click', finishWorkout);

  // Workout summary buttons
  $('#summary-save-btn')?.addEventListener('click', confirmSaveWorkout);
  $('#summary-continue-btn')?.addEventListener('click', continueSummaryWorkout);

  // History detail modal close
  $('#detail-modal-close')?.addEventListener('click', closeWorkoutDetail);

  // Progress segmented tabs
  $$('#progress-tabs .seg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.progressTab = tab.dataset.tab;
      renderProgress();
    });
  });

  // Profile view settings & actions
  $('#edit-name-btn')?.addEventListener('click', () => {
    const modal = $('#edit-name-modal');
    const input = $('#edit-name-input');
    if (modal && input) {
      input.value = localStorage.getItem('username') || 'Athlete';
      modal.classList.add('active');
      input.focus();
      input.select();
    }
  });

  $('#edit-name-save')?.addEventListener('click', () => {
    const name = $('#edit-name-input')?.value.trim();
    if (name) {
      localStorage.setItem('username', name);
      renderProfile();
      showToast('Name updated!');
    }
    $('#edit-name-modal')?.classList.remove('active');
  });

  // Export and settings
  $('#rest-dec-btn')?.addEventListener('click', () => changeDefaultRest(-15));
  $('#rest-inc-btn')?.addEventListener('click', () => changeDefaultRest(15));
  $('#export-data-btn')?.addEventListener('click', exportData);

  // Show iOS export tip if on Safari / iPhone
  const _isIOS    = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const _isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (_isIOS || _isSafari) {
    const tip = $('#export-ios-tip');
    if (tip) tip.style.display = 'block';
  }

  // Library events
  const libSearch = $('#lib-search');
  if (libSearch) {
    libSearch.addEventListener('input', async (e) => {
      state.libSearch = e.target.value;
      const exs = await db.exercises.getAll();
      renderLibraryList(exs);
    });
  }
  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      $$('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.libFilter = chip.dataset.cat;
      const exs = await db.exercises.getAll();
      renderLibraryList(exs);
    });
  });
  $('#add-custom-ex-btn')?.addEventListener('click', openAddExerciseModal);
  $('#add-ex-close')?.addEventListener('click', closeAddExModal);
  $('#add-ex-save')?.addEventListener('click', saveNewExercise);

  // PR modal
  $('#pr-modal-close')?.addEventListener('click', closePRModal);

  // Weight view
  $('#log-weight-btn')?.addEventListener('click', logWeight);
  $('#wt-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') logWeight(); });

  // Templates modal
  $('#open-templates-btn')?.addEventListener('click', openTemplatesModal);
  $('#templates-close')?.addEventListener('click', closeTemplatesModal);

  // ── Home sub-tabs (Dashboard / Calendar / Stats) ──────────────────────────
  $$('#home-tabs .seg-tab').forEach(btn => {
    btn.addEventListener('click', () => switchHomeTab(btn.dataset.tab));
  });

  // Calendar month navigation
  $('#cal-prev-month')?.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  $('#cal-next-month')?.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  // Stats time-range toggle
  $$('#stats-time-tabs .seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      statsTimeRange = btn.dataset.time;
      $$('#stats-time-tabs .seg-tab').forEach(b => b.classList.toggle('active', b.dataset.time === statsTimeRange));
      renderStatsDashboard();
    });
  });

  // ── BMI Calculator ─────────────────────────────────────────────────────────
  $('#bmi-calc-btn')?.addEventListener('click', calculateBMI);

  // ── Scroll picker triggers ─────────────────────────────────────────────────
  // Weight logger trigger
  $('#wt-input-btn')?.addEventListener('click', () => {
    const curVal = parseFloat($('#wt-input-btn').dataset.val) || 70;
    openScrollPicker({
      min: 10, max: 300, step: 0.5,
      currentValue: curVal,
      unit: state.unit,
      title: 'Select Body Weight',
      callback: (val) => {
        const b = $('#wt-input-btn');
        if (b) { b.dataset.val = val; b.textContent = `${val} ${state.unit}`; }
      }
    });
  });

  // BMI weight trigger
  $('#bmi-weight-btn')?.addEventListener('click', () => {
    const curVal = parseFloat($('#bmi-weight-btn').dataset.val) || 70;
    openScrollPicker({
      min: 10, max: 300, step: 0.5,
      currentValue: curVal,
      unit: 'kg',
      title: 'Select Weight (BMI)',
      callback: (val) => {
        const b = $('#bmi-weight-btn');
        if (b) { b.dataset.val = val; b.textContent = `${val} kg`; }
      }
    });
  });

  // Edit-profile weight trigger
  $('#edit-profile-weight-btn')?.addEventListener('click', () => {
    const curVal = parseFloat($('#edit-profile-weight-btn').dataset.val) || 70;
    openScrollPicker({
      min: 10, max: 300, step: 0.5,
      currentValue: curVal,
      unit: 'kg',
      title: 'Select Body Weight',
      callback: (val) => {
        const b = $('#edit-profile-weight-btn');
        if (b) { b.dataset.val = val; b.textContent = `${val} kg`; }
      }
    });
  });

  // ── Weight chart range tabs ────────────────────────────────────────────────
  $$('#weight-chart-range-tabs .seg-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      $$('#weight-chart-range-tabs .seg-tab').forEach(b => b.classList.toggle('active', b === btn));
      const entries = await db.weightLogs.getAll();
      renderWeightChartJS(entries.sort((a, b) => new Date(a.date) - new Date(b.date)), btn.dataset.range);
    });
  });

  // ── PR chart range tabs ────────────────────────────────────────────────────
  $$('#pr-range-tabs .seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#pr-range-tabs .seg-tab').forEach(b => b.classList.toggle('active', b === btn));
      if (state.currentPRExercise) openExercisePRModal(state.currentPRExercise);
    });
  });

  // ── Edit Profile Modal ────────────────────────────────────────────────────
  $('#edit-profile-btn')?.addEventListener('click', () => {
    const modal = $('#edit-profile-modal');
    if (!modal) return;
    // Pre-fill existing values
    const profile = JSON.parse(localStorage.getItem('profile') || '{}');
    const fieldMap = [
      { id: 'edit-profile-name',   key: 'name' },
      { id: 'edit-profile-age',    key: 'age' },
      { id: 'edit-profile-height', key: 'height' },
      { id: 'edit-profile-goal',   key: 'goal' },
    ];
    fieldMap.forEach(({ id, key }) => {
      const input = $(`#${id}`);
      if (input) input.value = profile[key] || '';
    });
    // Pre-fill weight button
    const wBtn = $('#edit-profile-weight-btn');
    if (wBtn && profile.weight) {
      wBtn.dataset.val = profile.weight;
      wBtn.textContent = `${profile.weight} kg`;
    }
    modal.classList.add('active');
  });

  $('#profile-bmi-link')?.addEventListener('click', () => {
    state.progressTab = 'weight';
    location.hash = 'progress';
  });

  $('#backdate-workout-check')?.addEventListener('change', (e) => {
    const wrap = $('#backdate-workout-picker-wrap');
    if (wrap) wrap.style.display = e.target.checked ? 'block' : 'none';
  });

  // Edit name button (legacy alias → profile modal)
  $('#edit-name-btn')?.addEventListener('click', () => {
    const modal = $('#edit-profile-modal') || $('#edit-name-modal');
    if (!modal) return;
    if (modal.id === 'edit-name-modal') {
      const input = $('#edit-name-input');
      if (input) {
        input.value = localStorage.getItem('username') || 'Athlete';
        input.focus(); input.select();
      }
    }
    modal.classList.add('active');
  });

  $('#edit-name-save')?.addEventListener('click', () => {
    const name = $('#edit-name-input')?.value.trim();
    if (name) {
      localStorage.setItem('username', name);
      renderProfile();
      showToast('Name updated!');
    }
    $('#edit-name-modal')?.classList.remove('active');
  });

  $('#edit-profile-save')?.addEventListener('click', () => {
    const fieldMap = [
      { inputId: 'edit-profile-name',   key: 'name' },
      { inputId: 'edit-profile-age',    key: 'age' },
      { inputId: 'edit-profile-height', key: 'height' },
      { inputId: 'edit-profile-goal',   key: 'goal' },
    ];
    const profile = JSON.parse(localStorage.getItem('profile') || '{}');
    fieldMap.forEach(({ inputId, key }) => {
      const val = $(`#${inputId}`)?.value.trim();
      if (val !== undefined && val !== '') profile[key] = val;
    });
    // Read weight from scroll picker button
    const wBtn = $('#edit-profile-weight-btn');
    if (wBtn && wBtn.dataset.val) profile.weight = wBtn.dataset.val;
    if (profile.name) localStorage.setItem('username', profile.name);
    localStorage.setItem('profile', JSON.stringify(profile));
    renderProfile();
    showToast('Profile saved! ✅');
    $('#edit-profile-modal')?.classList.remove('active');
  });

  // Close modals on overlay click
  ['#ex-picker-modal','#pr-modal','#add-ex-modal','#templates-modal','#edit-name-modal','#edit-profile-modal','#manage-ex-modal','#finish-prompt-modal','#workout-detail-modal'].forEach(sel => {
    const overlay = $(sel);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
  });

  // Restore saved active workout session if page reload occurred
  const savedWorkout = localStorage.getItem('activeWorkout');
  if (savedWorkout) {
    state.workout = JSON.parse(savedWorkout);
    state.activeExerciseIdx = parseInt(localStorage.getItem('activeExerciseIdx')) || 0;
    state.workoutElapsed = parseInt(localStorage.getItem('activeWorkoutElapsed')) || 0;
    startWorkoutTimer();
  }

  // Initial route
  const hash = location.hash.replace('#', '') || 'home';
  navigate(hash);

  // iOS install banner
  initIOSInstallBanner();

  // Sync PRs from existing workout history
  syncAllPRs().catch(console.warn);
}

document.addEventListener('DOMContentLoaded', init);
