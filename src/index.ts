// src/index.ts
import WorkerInterpreter from './workerInterpreter.js';

// --- Constants ---
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const CELL_SIZE = 4;
const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;
const GRID_AREA = GRID_WIDTH * GRID_HEIGHT;

// Speed presets
const SPEED_PRESETS = [
    { name: 'Very Slow', stepsPerFrame: 1 },
    { name: 'Slow', stepsPerFrame: 10 },
    { name: 'Fast', stepsPerFrame: 1000 },
    { name: 'Very Fast', stepsPerFrame: 10000 },
    { name: 'Maximum', stepsPerFrame: 100000 },
];

// --- Worker Management ---
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused';
    stepCount: number;
}

// --- State ---
const gridData: number[] = new Array(GRID_AREA).fill(0);
const workers: Map<number, Worker> = new Map();
let nextWorkerId = 1;
let globalInterval: number | null = null;
let currentStepsPerFrame = 1000; // Default to "Fast"

// --- DOM Elements ---
const canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
const workersContainer = document.getElementById('workers-container') as HTMLDivElement;
const addWorkerButton = document.getElementById('add-worker-btn') as HTMLButtonElement;
const startAllButton = document.getElementById('start-all-btn') as HTMLButtonElement;
const clearButton = document.getElementById('clear-btn') as HTMLButtonElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedInfo = document.getElementById('speed-info') as HTMLDivElement;
const transcriptArea = document.getElementById('transcript-area') as HTMLDivElement;
const ctx = canvas.getContext('2d');

// --- Core Functions ---

/**
 * Draws a single cell on the canvas based on its index in gridData.
 * @param index The index of the cell in the gridData array.
 */
function drawCell(index: number) {
    if (!ctx || index < 0 || index >= GRID_AREA) return;

    const x = (index % GRID_WIDTH) * CELL_SIZE;
    const y = Math.floor(index / GRID_WIDTH) * CELL_SIZE;
    const value = gridData[index] ?? 0; // Default to 0 if somehow undefined

    // 0-255の値をグレースケールに変換
    const grayValue = Math.floor(value);
    ctx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
}

/**
 * Draws the entire grid based on the current gridData.
 */
function drawGrid() {
    for (let i = 0; i < GRID_AREA; i++) {
        drawCell(i);
    }
}

/**
 * Clears the entire grid to black (0).
 */
function clearGrid() {
    gridData.fill(0);
    drawGrid();
    log('Grid cleared.');
}

// --- Scripting API ---

/**
 * Retrieves the value of a cell at a given index.
 * @param index The index of the cell.
 * @returns The value of the cell (0-255).
 */
function peek(index: number): number {
    if (index < 0 || index >= GRID_AREA) {
        return 0; // 範囲外は0を返す
    }
    return gridData[index] ?? 0;
}

/**
 * Updates the value of a cell at given coordinates and redraws it.
 * @param x The x coordinate (0-99).
 * @param y The y coordinate (0-99).
 * @param value The new value for the cell (0-255).
 */
function poke(x: number, y: number, value: number): void {
    // X, Yを0-99に正規化
    const xMod = ((Math.floor(x) % 100) + 100) % 100;
    const yMod = ((Math.floor(y) % 100) + 100) % 100;
    const index = xMod * 100 + yMod;
    
    if (index < 0 || index >= GRID_AREA) {
        return; // 範囲外は無視
    }
    
    // 値を0-255にクランプ
    const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
    gridData[index] = clampedValue;
    drawCell(index);
}

/**
 * Logs messages to the on-screen transcript area.
 * @param args The values to log.
 */
function log(...args: any[]): void {
    const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'number') return String(arg);
        return JSON.stringify(arg);
    }).join(' ');
    
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    transcriptArea.appendChild(logEntry);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; // Auto-scroll
}

// --- Execution Logic ---

/**
 * Stops the global execution loop.
 */
function stopGlobalExecution() {
    if (globalInterval !== null) {
        clearInterval(globalInterval);
        globalInterval = null;
    }
}

/**
 * Starts the global execution loop.
 */
function startGlobalExecution() {
    if (globalInterval !== null) return; // Already running
    
    globalInterval = window.setInterval(() => {
        executeGlobalStep();
    }, 1000 / 60); // 60 FPS
}

/**
 * Executes one frame for all active workers.
 */
function executeGlobalStep() {
    let hasActiveWorkers = false;
    
    workers.forEach((worker) => {
        if (worker.status !== 'running' || !worker.generator) return;
        
        hasActiveWorkers = true;
        
        try {
            // Execute multiple steps per frame based on speed setting
            for (let i = 0; i < currentStepsPerFrame; i++) {
                const result = worker.generator.next();
                worker.stepCount++;
                
                if (result.done) {
                    worker.status = 'stopped';
                    updateWorkerStatus(worker.id);
                    log(`Worker ${worker.id} completed.`);
                    break;
                }
            }
            
            updateWorkerStatus(worker.id);
        } catch (error) {
            worker.status = 'stopped';
            updateWorkerStatus(worker.id);
            if (error instanceof Error) {
                log(`Worker ${worker.id} error: ${error.message}`);
            } else {
                log(`Worker ${worker.id} encountered an unknown error.`);
            }
        }
    });
    
    // Stop global loop if no active workers
    if (!hasActiveWorkers) {
        stopGlobalExecution();
    }
}

// --- Worker Management Functions ---

/**
 * Updates the status display of a worker.
 */
function updateWorkerStatus(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker) return;
    
    const statusElement = document.getElementById(`status-${workerId}`);
    if (statusElement) {
        statusElement.textContent = `${worker.status} (${worker.stepCount} steps)`;
        statusElement.className = `worker-status status-${worker.status}`;
    }
}

/**
 * Starts a worker.
 */
function startWorker(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker) return;
    
    const textarea = document.getElementById(`script-${workerId}`) as HTMLTextAreaElement;
    if (!textarea) return;
    
    const script = textarea.value.trim();
    if (!script) {
        log(`Worker ${workerId}: No script to execute.`);
        return;
    }
    
    try {
        // Create new interpreter
        worker.interpreter = new WorkerInterpreter({
            gridData: gridData,
            peekFn: peek,
            pokeFn: (x, y, value) => poke(x, y, value),
            logFn: (...args) => log(`[Worker ${workerId}]`, ...args),
        });
        
        worker.interpreter.loadScript(script);
        worker.generator = worker.interpreter.run();
        worker.status = 'running';
        worker.stepCount = 0;
        
        updateWorkerStatus(workerId);
        startGlobalExecution();
        
        log(`Worker ${workerId} started.`);
    } catch (error) {
        worker.status = 'stopped';
        updateWorkerStatus(workerId);
        if (error instanceof Error) {
            log(`Worker ${workerId} error: ${error.message}`);
        }
    }
}

/**
 * Pauses a worker.
 */
function pauseWorker(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || worker.status !== 'running') return;
    
    worker.status = 'paused';
    updateWorkerStatus(workerId);
    log(`Worker ${workerId} paused.`);
}

/**
 * Resumes a worker.
 */
function resumeWorker(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker || worker.status !== 'paused' || !worker.generator) return;
    
    worker.status = 'running';
    updateWorkerStatus(workerId);
    startGlobalExecution();
    log(`Worker ${workerId} resumed.`);
}

/**
 * Stops a worker.
 */
function stopWorker(workerId: number) {
    const worker = workers.get(workerId);
    if (!worker) return;
    
    worker.status = 'stopped';
    worker.generator = null;
    worker.interpreter = null;
    updateWorkerStatus(workerId);
    log(`Worker ${workerId} stopped.`);
}

/**
 * Removes a worker.
 */
function removeWorker(workerId: number) {
    stopWorker(workerId);
    workers.delete(workerId);
    
    const card = document.getElementById(`worker-${workerId}`);
    if (card) {
        card.remove();
    }
    
    log(`Worker ${workerId} removed.`);
}

/**
 * Starts all workers.
 */
function startAllWorkers() {
    let startedCount = 0;
    workers.forEach((worker) => {
        if (worker.status === 'stopped') {
            startWorker(worker.id);
            startedCount++;
        }
    });
    
    if (startedCount > 0) {
        log(`Started ${startedCount} worker(s).`);
    } else {
        log('No workers to start.');
    }
}

/**
 * Adds a new worker card to the UI.
 */
function addWorker() {
    const workerId = nextWorkerId++;
    
    // Create worker object
    const worker: Worker = {
        id: workerId,
        interpreter: null,
        generator: null,
        status: 'stopped',
        stepCount: 0,
    };
    
    workers.set(workerId, worker);
    
    // Create card HTML
    const card = document.createElement('div');
    card.className = 'worker-card';
    card.id = `worker-${workerId}`;
    card.innerHTML = `
        <div class="worker-header">
            <span class="worker-title">Worker ${workerId}</span>
            <button class="remove-btn" data-worker-id="${workerId}">×</button>
        </div>
        <textarea class="worker-script" id="script-${workerId}" placeholder="Enter WorkerScript here...">: Worker ${workerId}
I=0,99
  X=I Y=${workerId * 5}
  $=255
  @=I
?="Worker ${workerId} done!"</textarea>
        <div class="worker-controls">
            <button class="start-btn" data-worker-id="${workerId}">Start</button>
            <button class="pause-btn" data-worker-id="${workerId}">Pause</button>
            <button class="resume-btn" data-worker-id="${workerId}">Resume</button>
            <button class="stop-btn" data-worker-id="${workerId}">Stop</button>
        </div>
        <div class="worker-status status-stopped" id="status-${workerId}">stopped (0 steps)</div>
    `;
    
    workersContainer.appendChild(card);
    log(`Worker ${workerId} added.`);
}

// --- Event Handlers ---

// Speed slider
speedSlider.addEventListener('input', () => {
    const index = parseInt(speedSlider.value) - 1;
    const preset = SPEED_PRESETS[index];
    if (preset) {
        currentStepsPerFrame = preset.stepsPerFrame;
        speedInfo.textContent = `${preset.name} (${preset.stepsPerFrame} steps/frame)`;
    }
});

// Add worker button
addWorkerButton.addEventListener('click', addWorker);

// Start all button
startAllButton.addEventListener('click', startAllWorkers);

// Clear grid button
clearButton.addEventListener('click', clearGrid);

// Event delegation for worker controls
workersContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.dataset.workerId) return;
    
    const workerId = parseInt(target.dataset.workerId);
    
    if (target.classList.contains('start-btn')) {
        startWorker(workerId);
    } else if (target.classList.contains('pause-btn')) {
        pauseWorker(workerId);
    } else if (target.classList.contains('resume-btn')) {
        resumeWorker(workerId);
    } else if (target.classList.contains('stop-btn')) {
        stopWorker(workerId);
    } else if (target.classList.contains('remove-btn')) {
        removeWorker(workerId);
    }
});

// --- Initialization ---
drawGrid(); // Draw the initial grid on load.

// Initialize speed display
const defaultPreset = SPEED_PRESETS[2]; // "Fast"
if (defaultPreset) {
    speedInfo.textContent = `${defaultPreset.name} (${defaultPreset.stepsPerFrame} steps/frame)`;
}

log('Multi-Worker System initialized.');
log('Click "Add New Worker" to create workers.');
log('');