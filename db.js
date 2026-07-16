/**
 * db.js — IndexedDB abstraction for GymTracker
 * Stores: exercises, workouts, sets, weightLogs, templates
 */

const DB_NAME = 'GymTrackerDB';
const DB_VERSION = 2;

const DEFAULT_EXERCISES = [
  // Push
  { name: 'Bench Press', category: 'Push', muscles: 'Chest, Triceps, Shoulders' },
  { name: 'Incline Bench Press', category: 'Push', muscles: 'Upper Chest, Triceps' },
  { name: 'Overhead Press', category: 'Push', muscles: 'Shoulders, Triceps' },
  { name: 'Dumbbell Shoulder Press', category: 'Push', muscles: 'Shoulders, Triceps' },
  { name: 'Lateral Raises', category: 'Push', muscles: 'Side Deltoids' },
  { name: 'Tricep Dips', category: 'Push', muscles: 'Triceps, Chest' },
  { name: 'Tricep Pushdown', category: 'Push', muscles: 'Triceps' },
  { name: 'Push-Ups', category: 'Push', muscles: 'Chest, Triceps, Shoulders' },
  { name: 'Dumbbell Chest Press', category: 'Push', muscles: 'Chest, Triceps' },
  { name: 'Incline Smith Press', category: 'Push', muscles: 'Upper Chest, Shoulders' },
  { name: 'Pec Deck', category: 'Push', muscles: 'Chest' },
  { name: 'Reverse Pec Deck', category: 'Pull', muscles: 'Rear Delts, Back' },
  { name: 'Incline Dumbbell Fly', category: 'Push', muscles: 'Upper Chest' },
  // Pull
  { name: 'Pull-Ups', category: 'Pull', muscles: 'Lats, Biceps' },
  { name: 'Barbell Row', category: 'Pull', muscles: 'Back, Biceps' },
  { name: 'Dumbbell Row', category: 'Pull', muscles: 'Back, Biceps' },
  { name: 'Lat Pulldown', category: 'Pull', muscles: 'Lats, Biceps' },
  { name: 'Seated Cable Row', category: 'Pull', muscles: 'Back, Biceps' },
  { name: 'Face Pulls', category: 'Pull', muscles: 'Rear Delts, Upper Back' },
  { name: 'Bicep Curl', category: 'Pull', muscles: 'Biceps' },
  { name: 'Hammer Curl', category: 'Pull', muscles: 'Biceps, Brachialis' },
  { name: 'Preacher Curl', category: 'Pull', muscles: 'Biceps' },
  { name: 'Incline Curl', category: 'Pull', muscles: 'Biceps' },
  { name: 'Spider Curl', category: 'Pull', muscles: 'Biceps' },
  { name: 'Cable Hammer Curl', category: 'Pull', muscles: 'Biceps, Forearms' },
  { name: 'T-Bar Row', category: 'Pull', muscles: 'Back, Biceps' },
  { name: 'Lat Pullover (Dumbbell)', category: 'Pull', muscles: 'Lats, Back' },
  { name: 'Lat Pullover (Cable)', category: 'Pull', muscles: 'Lats, Back' },
  { name: 'Straight Arm Pulldown', category: 'Pull', muscles: 'Lats, Back' },
  { name: 'Meadows Row', category: 'Pull', muscles: 'Back, Biceps' },
  { name: 'Trap Shrugs (Barbell)', category: 'Pull', muscles: 'Traps, Shoulders' },
  { name: 'Trap Shrugs (Dumbbell)', category: 'Pull', muscles: 'Traps, Shoulders' },
  { name: 'Cable Lateral Raise', category: 'Pull', muscles: 'Side Delts, Shoulders' },
  { name: 'Machine Shoulder Press', category: 'Push', muscles: 'Shoulders, Triceps' },
  // Legs
  { name: 'Squat', category: 'Legs', muscles: 'Quads, Glutes, Hamstrings' },
  { name: 'Deadlift', category: 'Legs', muscles: 'Hamstrings, Glutes, Back' },
  { name: 'Romanian Deadlift', category: 'Legs', muscles: 'Hamstrings, Glutes' },
  { name: 'Leg Press', category: 'Legs', muscles: 'Quads, Glutes' },
  { name: 'Leg Curl', category: 'Legs', muscles: 'Hamstrings' },
  { name: 'Leg Extension', category: 'Legs', muscles: 'Quads' },
  { name: 'Calf Raises', category: 'Legs', muscles: 'Calves' },
  { name: 'Hip Thrust', category: 'Legs', muscles: 'Glutes, Hamstrings' },
  { name: 'Hack Squat', category: 'Legs', muscles: 'Quads, Glutes' },
  { name: 'Smith Machine Squat', category: 'Legs', muscles: 'Quads, Glutes' },
  { name: 'Seated Calf Raise', category: 'Legs', muscles: 'Calves' },
  { name: 'Glute Kickback', category: 'Legs', muscles: 'Glutes' },
  // Core
  { name: 'Plank', category: 'Core', muscles: 'Core, Abs' },
  { name: 'Crunches', category: 'Core', muscles: 'Abs' },
  { name: 'Hanging Leg Raises', category: 'Core', muscles: 'Abs, Hip Flexors' },
  { name: 'Cable Crunch', category: 'Core', muscles: 'Abs' },
  // Cardio
  { name: 'Treadmill Run', category: 'Cardio', muscles: 'Full Body' },
  { name: 'Cycling', category: 'Cardio', muscles: 'Legs, Cardio' },
  { name: 'Rowing Machine', category: 'Cardio', muscles: 'Full Body' },
  // Forearms
  { name: 'Wrist Curls', category: 'Pull', muscles: 'Forearms' },
  { name: 'Reverse Curls', category: 'Pull', muscles: 'Forearms' },
];

// ─── Open DB ──────────────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // exercises store
      if (!db.objectStoreNames.contains('exercises')) {
        const exStore = db.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        exStore.createIndex('name', 'name', { unique: false });
        exStore.createIndex('category', 'category', { unique: false });
      }

      // workouts store
      if (!db.objectStoreNames.contains('workouts')) {
        const wStore = db.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true });
        wStore.createIndex('date', 'date', { unique: false });
        wStore.createIndex('templateId', 'templateId', { unique: false });
      }

      // sets store
      if (!db.objectStoreNames.contains('sets')) {
        const sStore = db.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        sStore.createIndex('workoutId', 'workoutId', { unique: false });
        sStore.createIndex('exerciseId', 'exerciseId', { unique: false });
      }

      // weightLogs store
      if (!db.objectStoreNames.contains('weightLogs')) {
        const wlStore = db.createObjectStore('weightLogs', { keyPath: 'id', autoIncrement: true });
        wlStore.createIndex('date', 'date', { unique: false });
      }

      // templates store
      if (!db.objectStoreNames.contains('templates')) {
        const tStore = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        tStore.createIndex('name', 'name', { unique: false });
      }

      // prs store
      if (!db.objectStoreNames.contains('prs')) {
        const prStore = db.createObjectStore('prs', { keyPath: 'id', autoIncrement: true });
        prStore.createIndex('exerciseId', 'exerciseId', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// ─── Generic CRUD helpers ─────────────────────────────────────────────────────
function getAll(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function getById(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function add(storeName, data) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).add(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function update(storeName, data) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

function remove(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

function getByIndex(storeName, indexName, value) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

// ─── Seed default exercises (only once) ───────────────────────────────────────
async function seedExercises() {
  const existing = await getAll('exercises');
  const existingNames = existing.map(e => e.name);
  for (const ex of DEFAULT_EXERCISES) {
    if (!existingNames.includes(ex.name)) {
      await add('exercises', ex);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
const db = {
  exercises: {
    getAll: () => getAll('exercises'),
    getById: (id) => getById('exercises', id),
    add: (data) => add('exercises', data),
    update: (data) => update('exercises', data),
    delete: (id) => remove('exercises', id),
  },
  workouts: {
    getAll: () => getAll('workouts'),
    getById: (id) => getById('workouts', id),
    add: (data) => add('workouts', data),
    update: (data) => update('workouts', data),
    delete: (id) => remove('workouts', id),
  },
  sets: {
    getAll: () => getAll('sets'),
    getByWorkout: (workoutId) => getByIndex('sets', 'workoutId', workoutId),
    getByExercise: (exerciseId) => getByIndex('sets', 'exerciseId', exerciseId),
    add: (data) => add('sets', data),
    update: (data) => update('sets', data),
    delete: (id) => remove('sets', id),
  },
  weightLogs: {
    getAll: () => getAll('weightLogs'),
    add: (data) => add('weightLogs', data),
    update: (data) => update('weightLogs', data),
    delete: (id) => remove('weightLogs', id),
  },
  templates: {
    getAll: () => getAll('templates'),
    getById: (id) => getById('templates', id),
    add: (data) => add('templates', data),
    update: (data) => update('templates', data),
    delete: (id) => remove('templates', id),
  },
  prs: {
    getAll: () => getAll('prs'),
    getByExercise: (exerciseId) => getByIndex('prs', 'exerciseId', exerciseId),
    add: (data) => add('prs', data),
    update: (data) => update('prs', data),
    delete: (id) => remove('prs', id),
    clear: () => openDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('prs', 'readwrite');
        const req = tx.objectStore('prs').clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    })
  },
  seed: seedExercises,
};
