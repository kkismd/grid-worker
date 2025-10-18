import { GridDiffRenderer } from './GridDiffRenderer';
import type { GridChange } from './GridDiffRenderer';

/**
 * 上下分割画面レンダラー
 * 
 * VT-100 DECSTBM (Set Top and Bottom Margins) を使用して、
 * 固定グリッド領域とスクロールするトランスクリプト領域に分離
 * 
 * レイアウト:
 *   1-3行目: ヘッダー（固定）
 *   4-N行目: グリッド表示（固定、差分更新）
 *   N+1行目以降: トランスクリプト（自動スクロール）
 */
export class SplitScreenRenderer {
    private gridRenderer: GridDiffRenderer;
    private headerLines: number = 3;  // ヘッダー行数
    private transcriptStartLine: number;  // トランスクリプト開始行
    
    constructor(
        private gridSize: number,
        private title?: string
    ) {
        this.gridRenderer = new GridDiffRenderer(gridSize);
        // グリッド高さ = ヘッダー行数 + グリッド行数(gridSize + 2行のヘッダー)
        this.transcriptStartLine = this.headerLines + this.gridSize + 3;
    }
    
    /**
     * 画面初期化（固定領域とスクロール領域のセットアップ）
     */
    initScreen(): string {
        let output = '';
        
        // 1. 画面クリアとカーソルを左上へ
        output += '\x1b[2J\x1b[H';
        
        // 2. カーソル非表示
        output += '\x1b[?25l';
        
        // 3. ヘッダー描画（固定領域）
        output += this.renderHeader();
        
        // 4. グリッド初期化（固定領域）
        const gridLines = this.gridRenderer.initScreen().split('\n');
        for (let i = 0; i < gridLines.length; i++) {
            if (gridLines[i]) {
                output += gridLines[i];
                if (i < gridLines.length - 1) {
                    output += '\n';
                }
            }
        }
        
        // 5. スクロール領域設定（トランスクリプト領域のみスクロール）
        output += `\x1b[${this.transcriptStartLine};r`;
        
        // 6. トランスクリプト開始位置へカーソル移動
        output += `\x1b[${this.transcriptStartLine};1H`;
        
        // 7. トランスクリプト領域のヘッダー
        output += '─'.repeat(40) + ' Transcript ' + '─'.repeat(40) + '\n';
        
        return output;
    }
    
    /**
     * ヘッダー描画
     */
    private renderHeader(): string {
        const titleLine = this.title || 'WorkerScript Real-Time Mode';
        const border = '═'.repeat(Math.max(titleLine.length + 4, 40));
        
        return `╔${border}╗\n` +
               `║  ${titleLine}${' '.repeat(border.length - titleLine.length - 2)}║\n` +
               `╚${border}╝\n`;
    }
    
    /**
     * グリッド更新（固定領域内で差分更新）
     */
    updateGrid(oldGrid: number[][], newGrid: number[][]): string {
        // スクロール領域を一時的にリセット（グリッド更新のため）
        let output = '\x1b[r';
        
        // グリッド差分を計算
        const changes = this.detectGridChanges(oldGrid, newGrid);
        
        // 差分を描画（固定領域内でカーソル移動）
        for (const change of changes) {
            // ヘッダー分オフセット（3行 + グリッドヘッダー2行）
            const row = this.headerLines + 2 + change.y;
            // X座標は 4文字目から開始（行番号表示分）、各セルは2文字幅
            const col = 4 + change.x * 2;
            
            output += `\x1b[${row};${col}H`;
            output += this.valueToChar(change.value);
        }
        
        // スクロール領域を再設定
        output += `\x1b[${this.transcriptStartLine};r`;
        
        // トランスクリプト位置に戻る
        output += `\x1b[${this.transcriptStartLine + 1};1H`;
        
        return output;
    }
    
    /**
     * グリッド差分検出
     */
    private detectGridChanges(oldGrid: number[][], newGrid: number[][]): GridChange[] {
        const changes: GridChange[] = [];
        const size = Math.min(oldGrid.length, newGrid.length);
        
        for (let y = 0; y < size; y++) {
            const oldRow = oldGrid[y] || [];
            const newRow = newGrid[y] || [];
            const rowSize = Math.min(oldRow.length, newRow.length);
            
            for (let x = 0; x < rowSize; x++) {
                const oldValue = oldRow[x] || 0;
                const newValue = newRow[x] || 0;
                
                if (oldValue !== newValue) {
                    changes.push({ x, y, value: newValue });
                }
            }
        }
        
        return changes;
    }
    
    /**
     * 値を文字列に変換（2文字幅）
     */
    private valueToChar(value: number): string {
        if (value === 0) {
            return '. ';
        } else if (value >= 192) {  // 3/4以上
            return '██';
        } else if (value >= 128) {  // 1/2以上
            return '▓▓';
        } else if (value >= 64) {   // 1/4以上
            return '▒▒';
        } else {
            return '░░';
        }
    }
    
    /**
     * トランスクリプトに行を追加（自動スクロール）
     */
    addTranscriptLine(text: string): void {
        // スクロール領域内で出力（自動でスクロール）
        // 改行は含めない（呼び出し側で管理）
        process.stdout.write(text);
    }
    
    /**
     * トランスクリプトに文字を追加（改行なし）
     */
    addTranscriptChar(char: string): void {
        process.stdout.write(char);
    }
    
    /**
     * 画面クリーンアップ
     */
    cleanup(): string {
        let output = '';
        
        // スクロール領域リセット
        output += '\x1b[r';
        
        // カーソル表示
        output += '\x1b[?25h';
        
        // 画面クリア
        output += '\x1b[2J\x1b[H';
        
        return output;
    }
}
