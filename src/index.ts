// src/index.ts
import WorkerInterpreter from './workerInterpreter.js';

// --- Constants ---
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const CELL_SIZE = 4;
const GRID_AREA = GRID_WIDTH * GRID_HEIGHT;

// Speed presets
const SPEED_PRESETS = [
    { name: 'Very Slow', stepsPerFrame: 1 },
    { name: 'Slow', stepsPerFrame: 10 },
    { name: 'Normal', stepsPerFrame: 500 },
    { name: 'Fast', stepsPerFrame: 1000 },
    { name: 'Very Fast', stepsPerFrame: 5000 },
    { name: 'Turbo', stepsPerFrame: 8000 },
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

// --- Keyboard Input State ---
const keyQueue: number[] = []; // キーの入力キュー
let keyboardInputEnabled = false; // キーボード入力の有効/無効状態

// --- DOM Elements ---
const canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
const workersContainer = document.getElementById('workers-container') as HTMLDivElement;
const addWorkerButton = document.getElementById('add-worker-btn') as HTMLButtonElement;
const cloneButton = document.getElementById('clone-btn') as HTMLButtonElement;
const startAllButton = document.getElementById('start-all-btn') as HTMLButtonElement;
const clearButton = document.getElementById('clear-btn') as HTMLButtonElement;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
const speedInfo = document.getElementById('speed-info') as HTMLDivElement;
const keyboardStatus = document.getElementById('keyboard-status') as HTMLDivElement;
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
    logSystem('Grid cleared.');
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
 * Logs system messages to the on-screen transcript area (with automatic newlines).
 * @param args The values to log.
 */
function logSystem(...args: any[]): void {
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

/**
 * WorkerScript出力用関数（改行判定あり）
 * @param workerId ワーカーID
 * @param args 出力する値
 */
function logWorkerOutput(workerId: number, ...args: any[]): void {
    const message = args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'number') return String(arg);
        return JSON.stringify(arg);
    }).join(' ');
    
    // 改行文字の場合は改行処理
    if (message === '\n' || message === '\\n') {
        logWorkerNewline();
        return;
    }
    
    const logEntry = document.createElement('span');
    logEntry.textContent = `[W${workerId}] ${message}`;
    logEntry.style.color = '#0066cc';
    transcriptArea.appendChild(logEntry);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; // Auto-scroll
}

/**
 * WorkerScript改行出力用関数
 */
function logWorkerNewline(): void {
    const logEntry = document.createElement('br');
    transcriptArea.appendChild(logEntry);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; // Auto-scroll
}

/**
 * VTL互換 1byte出力処理
 * @param workerId ワーカーID 
 * @param value 出力する値（0-255）
 */
function putOutput(workerId: number, value: number): void {
    // 値を0-255の範囲にクランプ
    const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
    
    let outputChar = '';
    
    // ASCII文字として出力（印刷可能文字の場合）
    if (clampedValue >= 32 && clampedValue <= 126) {
        outputChar = String.fromCharCode(clampedValue);
        // 通常文字はそのまま出力
        const logEntry = document.createElement('span');
        logEntry.textContent = `[W${workerId}:$] ${outputChar}`;
        logEntry.style.fontFamily = 'Courier New, monospace';
        logEntry.style.color = '#006600';
        transcriptArea.appendChild(logEntry);
    } else if (clampedValue === 10 || clampedValue === 13) {
        // 改行文字（LF=10, CR=13）の場合は実際に改行
        logWorkerNewline();
    } else {
        // その他の制御文字は16進数で表示
        outputChar = `[0x${clampedValue.toString(16).padStart(2, '0')}]`;
        const logEntry = document.createElement('span');
        logEntry.textContent = `[W${workerId}:$] ${outputChar}`;
        logEntry.style.fontFamily = 'Courier New, monospace';
        logEntry.style.color = '#006600';
        transcriptArea.appendChild(logEntry);
    }
    
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
                    logSystem(`Worker ${worker.id} completed.`);
                    break;
                }
            }
            
            updateWorkerStatus(worker.id);
        } catch (error) {
            worker.status = 'stopped';
            updateWorkerStatus(worker.id);
            if (error instanceof Error) {
                logSystem(`Worker ${worker.id} error: ${error.message}`);
            } else {
                logSystem(`Worker ${worker.id} encountered an unknown error.`);
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
    
    // ワーカーの状態が変わったらキーボード状態も更新
    updateKeyboardStatus();
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
        logSystem(`Worker ${workerId}: No script to execute.`);
        return;
    }
    
    try {
        // Create new interpreter
        worker.interpreter = new WorkerInterpreter({
            gridData: gridData,
            peekFn: peek,
            pokeFn: (x, y, value) => poke(x, y, value),
            logFn: (...args) => logWorkerOutput(workerId, ...args),
            getFn: getKeyInput,
            putFn: (value: number) => putOutput(workerId, value),
        });
        
        worker.interpreter.loadScript(script);
        worker.generator = worker.interpreter.run();
        worker.status = 'running';
        worker.stepCount = 0;
        
        updateWorkerStatus(workerId);
        startGlobalExecution();
        
        logSystem(`Worker ${workerId} started.`);
    } catch (error) {
        worker.status = 'stopped';
        updateWorkerStatus(workerId);
        if (error instanceof Error) {
            logSystem(`Worker ${workerId} error: ${error.message}`);
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
    logSystem(`Worker ${workerId} paused.`);
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
    logSystem(`Worker ${workerId} resumed.`);
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
    logSystem(`Worker ${workerId} stopped.`);
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
    
    logSystem(`Worker ${workerId} removed.`);
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
        logSystem(`Started ${startedCount} worker(s).`);
    } else {
        logSystem('No workers to start.');
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
@=I,0,99
  X=I Y=${workerId * 5}
  \`=255
#=@
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
    logSystem(`Worker ${workerId} added.`);
}

/**
 * Clones the first worker's script and creates a new worker with it.
 */
function cloneFirstWorker() {
    // Get worker 1
    const firstWorker = workers.get(1);
    if (!firstWorker) {
        logSystem('Worker 1 が存在しないため、クローンできません。');
        return;
    }
    
    // Get worker 1's script
    const firstScript = document.getElementById('script-1') as HTMLTextAreaElement;
    if (!firstScript) {
        logSystem('Worker 1 のスクリプトが見つかりません。');
        return;
    }
    
    const scriptContent = firstScript.value;
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
    
    // Create card HTML with cloned script
    const card = document.createElement('div');
    card.className = 'worker-card';
    card.id = `worker-${workerId}`;
    card.innerHTML = `
        <div class="worker-header">
            <span class="worker-title">Worker ${workerId}</span>
            <button class="remove-btn" data-worker-id="${workerId}">×</button>
        </div>
        <textarea class="worker-script" id="script-${workerId}" placeholder="Enter WorkerScript here...">${scriptContent}</textarea>
        <div class="worker-controls">
            <button class="start-btn" data-worker-id="${workerId}">Start</button>
            <button class="pause-btn" data-worker-id="${workerId}">Pause</button>
            <button class="resume-btn" data-worker-id="${workerId}">Resume</button>
            <button class="stop-btn" data-worker-id="${workerId}">Stop</button>
        </div>
        <div class="worker-status status-stopped" id="status-${workerId}">stopped (0 steps)</div>
    `;
    
    workersContainer.appendChild(card);
    logSystem(`Worker ${workerId} created (Worker 1 からクローン).`);
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

// Clone first worker button
cloneButton.addEventListener('click', cloneFirstWorker);

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

// --- Keyboard Input Handling ---
document.addEventListener('keydown', (e) => {
    // キーボード入力が有効でない場合は何もしない
    if (!shouldCaptureKeyboard()) {
        return;
    }
    
    // 特殊なキーは無視（F1-F12、Ctrl、Alt、Shiftなど）
    if (e.ctrlKey || e.altKey || e.metaKey || 
        e.key.length > 1 && !['Enter', 'Escape', 'Backspace', 'Tab', ' '].includes(e.key)) {
        return;
    }
    
    let keyCode = 0;
    
    // 特殊キーのマッピング
    switch (e.key) {
        case 'Enter': keyCode = 13; break;
        case 'Escape': keyCode = 27; break;
        case 'Backspace': keyCode = 8; break;
        case 'Tab': keyCode = 9; break;
        case ' ': keyCode = 32; break;
        default:
            // 通常の文字キー
            if (e.key.length === 1) {
                keyCode = e.key.charCodeAt(0);
            }
            break;
    }
    
    if (keyCode > 0) {
        keyQueue.push(keyCode);
        
        // キーボード状態表示を更新
        const displayChar = keyCode >= 32 && keyCode <= 126 ? 
            String.fromCharCode(keyCode) : 
            `[${keyCode}]`;
        keyboardStatus.textContent = `Key pressed: "${displayChar}" (ASCII: ${keyCode}) - Queue: ${keyQueue.length}`;
        keyboardStatus.style.backgroundColor = '#fff3cd';
        keyboardStatus.style.borderColor = '#ffc107';
        keyboardStatus.style.color = '#856404';
        
        // デバッグ表示
        console.log(`Key pressed: ${e.key} (ASCII: ${keyCode})`);
        
        // キーボード入力をキャプチャしている場合のみイベントを無効化
        e.preventDefault();
    }
});

document.addEventListener('keyup', (_e) => {
    // キーボード状態表示を更新
    updateKeyboardStatus();
});

// フォーカスイベントでキーボード状態を更新
document.addEventListener('focusin', updateKeyboardStatus);
document.addEventListener('focusout', updateKeyboardStatus);

// キーボード状態エリアをクリックして手動切り替え
keyboardStatus.addEventListener('click', () => {
    keyboardInputEnabled = !keyboardInputEnabled;
    updateKeyboardStatus();
    
    if (keyboardInputEnabled) {
        console.log('Keyboard input manually enabled');
    } else {
        console.log('Keyboard input manually disabled');
        // 手動で無効化した場合はキューもクリア
        keyQueue.length = 0;
    }
});

// キーボード入力が有効かどうかをチェックする関数
function shouldCaptureKeyboard(): boolean {
    // テキストエリアや入力フィールドにフォーカスがある場合は無効
    const activeElement = document.activeElement;
    if (activeElement && (
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'INPUT' ||
        (activeElement as HTMLElement).contentEditable === 'true'
    )) {
        return false;
    }
    
    // 実行中のワーカーがない場合は無効
    const hasRunningWorkers = Array.from(workers.values()).some(worker => worker.status === 'running');
    if (!hasRunningWorkers) {
        return false;
    }
    
    // 明示的に無効化されている場合
    if (!keyboardInputEnabled) {
        return false;
    }
    
    return true;
}

// キーボード状態表示を更新する関数
function updateKeyboardStatus() {
    if (!shouldCaptureKeyboard()) {
        if (document.activeElement && (
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'INPUT'
        )) {
            keyboardStatus.textContent = 'Keyboard disabled - Text input has focus';
        } else if (!Array.from(workers.values()).some(worker => worker.status === 'running')) {
            keyboardStatus.textContent = 'Keyboard disabled - No workers running';
        } else if (!keyboardInputEnabled) {
            keyboardStatus.textContent = 'Keyboard disabled - Click to enable';
        }
        keyboardStatus.style.backgroundColor = '#f5f5f5';
        keyboardStatus.style.borderColor = '#ccc';
        keyboardStatus.style.color = '#666';
    } else if (keyQueue.length === 0) {
        keyboardStatus.textContent = 'Ready - Press any key (Click to disable)';
        keyboardStatus.style.backgroundColor = '#e8f5e8';
        keyboardStatus.style.borderColor = '#4CAF50';
        keyboardStatus.style.color = '#2E7D32';
    } else {
        keyboardStatus.textContent = `Queue: ${keyQueue.length} keys waiting`;
        keyboardStatus.style.backgroundColor = '#e3f2fd';
        keyboardStatus.style.borderColor = '#2196f3';
        keyboardStatus.style.color = '#1565c0';
    }
}

// getFn: キー入力を取得する関数
function getKeyInput(): number {
    // キューから最初のキーを取得（FIFO）
    if (keyQueue.length > 0) {
        const key = keyQueue.shift()!;
        updateKeyboardStatus();
        return key;
    }
    // 何も押されていない場合は0を返す
    return 0;
}

// --- Initialization ---
drawGrid(); // Draw the initial grid on load.

// Initialize speed display
const defaultPreset = SPEED_PRESETS[3]; // "Fast"
if (defaultPreset) {
    speedInfo.textContent = `${defaultPreset.name} (${defaultPreset.stepsPerFrame} steps/frame)`;
}

// Initialize keyboard status
updateKeyboardStatus();

logSystem('Multi-Worker System initialized.');
logSystem('Click "Add New Worker" to create workers.');
logSystem('');