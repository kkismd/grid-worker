// src/index.ts
import WorkerInterpreter from './workerInterpreter.js';

// --- Constants ---
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const CELL_SIZE = 4;
const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;
const GRID_AREA = GRID_WIDTH * GRID_HEIGHT;

// --- State ---
const gridData: number[] = new Array(GRID_AREA).fill(0);
let currentInterpreter: WorkerInterpreter | null = null;
let executionGenerator: Generator<void, void, unknown> | null = null;
let executionInterval: number | null = null;

// --- DOM Elements ---
const canvas = document.getElementById('grid-canvas') as HTMLCanvasElement;
const scriptInput = document.getElementById('script-input') as HTMLTextAreaElement;
const executeButton = document.getElementById('execute-button') as HTMLButtonElement;
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
 * Stops the current script execution.
 */
function stopExecution() {
    if (executionInterval !== null) {
        clearInterval(executionInterval);
        executionInterval = null;
    }
    executionGenerator = null;
    executeButton.textContent = 'Execute';
    executeButton.disabled = false;
}

/**
 * Executes one step of the script.
 */
function executeStep() {
    if (!executionGenerator) {
        stopExecution();
        return;
    }

    try {
        const result = executionGenerator.next();
        if (result.done) {
            stopExecution();
            log('--- Script execution completed ---');
        }
    } catch (error) {
        stopExecution();
        if (error instanceof Error) {
            log(`Error: ${error.message}`);
        } else {
            log(`An unknown error occurred.`);
        }
    }
}

/**
 * Executes the script from the textarea using WorkerInterpreter.
 */
function executeScript() {
    const userScript = scriptInput.value;
    if (!userScript) return;

    // 既存の実行を停止
    stopExecution();

    // トランスクリプトをクリア
    transcriptArea.innerHTML = '';
    log('--- Starting script execution ---');

    try {
        // WorkerInterpreterのインスタンスを作成
        currentInterpreter = new WorkerInterpreter({
            gridData: gridData,
            peekFn: peek,
            pokeFn: poke,
            logFn: log,
        });

        // スクリプトをロード
        currentInterpreter.loadScript(userScript);

        // 実行ジェネレータを取得
        executionGenerator = currentInterpreter.run();

        // ボタンを更新
        executeButton.textContent = 'Running...';
        executeButton.disabled = true;

        // 定期的にステップを実行（60 FPS相当）
        executionInterval = window.setInterval(executeStep, 1000 / 60);

    } catch (error) {
        stopExecution();
        if (error instanceof Error) {
            log(`Error: ${error.message}`);
        } else {
            log(`An unknown error occurred.`);
        }
    }
}

// --- Initialization ---
executeButton.addEventListener('click', executeScript);
drawGrid(); // Draw the initial grid on load.

log('WorkerScript Interpreter initialized. Ready to execute script.');
log('');

// Example script for user convenience
scriptInput.value = `: Draw a diagonal line
X=0 Y=0
I=0,99
  X=I Y=I
  $=255
  @=I

?="Diagonal line drawn!"
`;

