// --- Constants ---
const GRID_WIDTH = 100;
const GRID_HEIGHT = 100;
const CELL_SIZE = 4;
const CANVAS_WIDTH = GRID_WIDTH * CELL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * CELL_SIZE;
const GRID_AREA = GRID_WIDTH * GRID_HEIGHT;

// --- State ---
const gridData: number[] = new Array(GRID_AREA).fill(0);

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

    ctx.fillStyle = value === 0 ? 'black' : 'white';
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
 * @returns The value of the cell (0 or 1).
 */
function peek(index: number): number {
    if (index < 0 || index >= GRID_AREA) {
        throw new Error(`peek(): index ${index} is out of bounds.`);
    }
    // We use a non-null assertion (!) because the check above ensures the index is valid.
    return gridData[index]!;
}

/**
 * Updates the value of a cell at a given index and redraws it.
 * @param index The index of the cell.
 * @param value The new value for the cell (should be 0 or 1).
 */
function poke(index: number, value: number): void {
    if (index < 0 || index >= GRID_AREA) {
        throw new Error(`poke(): index ${index} is out of bounds.`);
    }
    gridData[index] = value;
    drawCell(index);
}

/**
 * Logs messages to the on-screen transcript area.
 * @param args The values to log.
 */
function log(...args: any[]): void {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    const logEntry = document.createElement('div');
    logEntry.textContent = `> ${message}`;
    transcriptArea.appendChild(logEntry);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; // Auto-scroll
}

// --- Execution Logic ---

/**
 * Executes the script from the textarea.
 */
function executeScript() {
    const userScript = scriptInput.value;
    if (!userScript) return;

    try {
        // Create a sandboxed function with our API as arguments.
        const sandboxedExecutor = new Function('peek', 'poke', 'log', userScript);
        sandboxedExecutor(peek, poke, log);
    } catch (error) {
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

log('System initialized. Ready to execute script.');

// Example script for user convenience
scriptInput.value = `// Example: Draw a white diagonal line
for (let i = 0; i < 100; i++) {
    const index = i * 100 + i;
    poke(index, 1);
}
log('Diagonal line drawn!');
`;
