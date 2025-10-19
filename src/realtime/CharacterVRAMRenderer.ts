import type { GridChange } from './GridDiffRenderer';

/**
 * キャラクターVRAMレンダラー
 * 
 * グリッドの16ビット値をキャラクターVRAMとして解釈：
 * - 下位8ビット: ASCII文字コード (0-255)
 * - 上位8ビット: カラーコード
 *   - 下位4ビット: 前景色 (0-15)
 *   - 上位4ビット: 背景色 (0-15)
 * 
 * 例:
 *   0x0741 → 背景色7(白), 前景色4(青), 文字'A'(65)
 *   0x1E48 → 背景色1(赤), 前景色14(明黄), 文字'H'(72)
 */
export class CharacterVRAMRenderer {
    private width: number;
    private height: number;
    private lastFrame: number[][];
    private displayWidth: number;
    private displayHeight: number;

    constructor(
        width: number = 100,
        height: number = 100,
        displayWidth: number = 40,
        displayHeight: number = 20
    ) {
        this.width = width;
        this.height = height;
        this.displayWidth = displayWidth;
        this.displayHeight = displayHeight;
        this.lastFrame = Array(displayHeight).fill(null).map(() => 
            Array(displayWidth).fill(0)
        );
    }

    /**
     * 画面初期化
     */
    initScreen(): string {
        let output = '';
        
        // カーソル非表示
        output += CharacterVRAMRenderer.hideCursor();
        
        // 画面クリア
        output += '\x1b[2J\x1b[H';
        
        // グリッドヘッダー（列番号）
        output += '   ';
        for (let x = 0; x < this.displayWidth; x++) {
            output += (x % 10);
        }
        output += '\n';
        
        output += '   ' + '-'.repeat(this.displayWidth) + '\n';
        
        // 初期グリッド描画（全て空白）
        for (let y = 0; y < this.displayHeight; y++) {
            output += (y % 10).toString().padStart(2, ' ') + '|';
            for (let x = 0; x < this.displayWidth; x++) {
                output += ' ';  // 空白
            }
            output += '\n';
        }
        
        return output;
    }

    /**
     * グリッド差分描画
     */
    renderDiff(gridData: number[]): string {
        const currentFrame = this.convertToDisplay(gridData);
        const changes = this.detectChanges(currentFrame);
        
        if (changes.length === 0) {
            return '';
        }
        
        const output = this.generateANSI(changes, currentFrame);
        
        // フレームバッファ更新（深いコピー）
        this.lastFrame = currentFrame.map(row => [...row]);
        
        return output;
    }

    /**
     * 1次元配列を2次元表示用に変換
     */
    private convertToDisplay(gridData: number[]): number[][] {
        const display: number[][] = [];
        
        for (let y = 0; y < this.displayHeight; y++) {
            const row: number[] = [];
            for (let x = 0; x < this.displayWidth; x++) {
                const index = y * this.width + x;
                const value = gridData[index] || 0;
                row.push(value);
            }
            display.push(row);
        }
        
        return display;
    }

    /**
     * 差分検出
     */
    private detectChanges(currentFrame: number[][]): GridChange[] {
        const changes: GridChange[] = [];
        
        for (let y = 0; y < this.displayHeight; y++) {
            for (let x = 0; x < this.displayWidth; x++) {
                const oldValue = this.lastFrame[y]?.[x] || 0;
                const newValue = currentFrame[y]?.[x] || 0;
                
                if (oldValue !== newValue) {
                    changes.push({ x, y, value: newValue });
                }
            }
        }
        
        return changes;
    }

    /**
     * ANSI エスケープシーケンス生成
     */
    private generateANSI(changes: GridChange[], _currentFrame: number[][]): string {
        let output = '';
        
        for (const change of changes) {
            const { x, y, value } = change;
            
            // ヘッダー分のオフセット（2行）
            const row = y + 3;
            const col = x + 4;  // 行番号表示分
            
            // カーソル移動
            output += `\x1b[${row};${col}H`;
            
            // 文字とカラーを描画（カラーリセットも含む）
            output += this.valueToCharWithColor(value);
            output += '\x1b[0m';  // 各文字ごとにリセット
        }
        
        return output;
    }

    /**
     * 16ビット値を文字とカラーに変換
     */
    private valueToCharWithColor(value: number): string {
        // 下位8ビット: ASCII文字
        const ascii = value & 0xFF;
        
        // 上位8ビット: カラーコード
        const colorCode = (value >> 8) & 0xFF;
        const fgColor = colorCode & 0x0F;        // 下位4ビット: 前景色
        const bgColor = (colorCode >> 4) & 0x0F; // 上位4ビット: 背景色
        
        // ASCII文字を取得（0や制御文字は空白に）
        const char = this.asciiToChar(ascii);
        
        // カラーエスケープシーケンス生成
        const colorSeq = this.generateColorSequence(fgColor, bgColor);
        
        return `${colorSeq}${char}`;
    }

    /**
     * ASCII値を表示可能文字に変換
     */
    private asciiToChar(ascii: number): string {
        // 0や制御文字（0-31, 127）は空白に
        if (ascii === 0 || ascii < 32 || ascii === 127) {
            return ' ';
        }
        
        // 表示可能文字（32-126）
        return String.fromCharCode(ascii);
    }

    /**
     * ANSIカラーエスケープシーケンス生成
     */
    private generateColorSequence(fg: number, bg: number): string {
        // ANSI 16色対応
        // 0-7: 通常色、8-15: 明るい色
        
        const fgCode = fg < 8 ? 30 + fg : 90 + (fg - 8);
        const bgCode = bg < 8 ? 40 + bg : 100 + (bg - 8);
        
        return `\x1b[${fgCode};${bgCode}m`;
    }

    /**
     * カーソル非表示
     */
    static hideCursor(): string {
        return '\x1b[?25l';
    }

    /**
     * カーソル表示
     */
    static showCursor(): string {
        return '\x1b[?25h';
    }

    /**
     * ヘルパー: 16ビット値をエンコード
     */
    static encodeVRAM(ascii: number, fgColor: number, bgColor: number): number {
        const asciiClamped = Math.max(0, Math.min(255, ascii));
        const fgClamped = Math.max(0, Math.min(15, fgColor));
        const bgClamped = Math.max(0, Math.min(15, bgColor));
        
        const colorCode = (bgClamped << 4) | fgClamped;
        return (colorCode << 8) | asciiClamped;
    }

    /**
     * ヘルパー: 16ビット値をデコード
     */
    static decodeVRAM(value: number): { ascii: number; fgColor: number; bgColor: number } {
        const ascii = value & 0xFF;
        const colorCode = (value >> 8) & 0xFF;
        const fgColor = colorCode & 0x0F;
        const bgColor = (colorCode >> 4) & 0x0F;
        
        return { ascii, fgColor, bgColor };
    }
}
