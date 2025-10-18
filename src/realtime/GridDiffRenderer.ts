// src/realtime/GridDiffRenderer.ts - ANSIエスケープシーケンスでグリッド差分描画

/**
 * グリッド上の1つの変更点
 */
export interface GridChange {
    x: number;
    y: number;
    value: number;
}

/**
 * グリッド差分レンダラー
 * 
 * 前フレームとの差分を検出し、変更された部分のみをANSIエスケープシーケンスで描画する。
 * ターミナル上でのリアルタイムグリッド表示を最適化。
 */
export class GridDiffRenderer {
    private width: number;
    private height: number;
    private lastFrame: number[];
    private displayWidth: number;
    private displayHeight: number;

    /**
     * @param width グリッド幅（デフォルト: 100）
     * @param height グリッド高さ（デフォルト: 100）
     * @param displayWidth 表示幅（デフォルト: 20）
     * @param displayHeight 表示高さ（デフォルト: 20）
     */
    constructor(
        width: number = 100,
        height: number = 100,
        displayWidth: number = 20,
        displayHeight: number = 20
    ) {
        this.width = width;
        this.height = height;
        this.displayWidth = Math.min(displayWidth, width);
        this.displayHeight = Math.min(displayHeight, height);
        this.lastFrame = new Array(width * height).fill(0);
    }

    /**
     * 初期画面をクリアしてヘッダーを描画
     */
    initScreen(): string {
        let output = '';
        
        // 画面クリア
        output += '\x1b[2J';  // Clear entire screen
        output += '\x1b[H';   // Move cursor to home (1,1)
        
        // ヘッダー行（X座標）文字間に空白挿入
        output += '   ';  // 左マージン（Y座標用）
        for (let x = 0; x < this.displayWidth; x++) {
            output += (x % 10).toString();
            if (x < this.displayWidth - 1) {
                output += ' ';  // 文字間に空白
            }
        }
        output += '\n';
        
        // 区切り線（空白を含めた長さ）
        output += '   ';
        output += '-'.repeat(this.displayWidth * 2 - 1);
        output += '\n';
        
        // グリッド行を初期化（すべて2文字幅）
        for (let y = 0; y < this.displayHeight; y++) {
            output += `${y % 10} |`;  // Y座標 + 空白
            for (let x = 0; x < this.displayWidth; x++) {
                output += this.valueToChar(0);  // '. ' が返される
            }
            output += '\n';
        }
        
        return output;
    }

    /**
     * グリッドの差分を検出して描画
     * @param gridData 現在のグリッドデータ
     * @returns ANSIエスケープシーケンス文字列
     */
    renderDiff(gridData: number[]): string {
        const changes = this.detectChanges(gridData);
        
        if (changes.length === 0) {
            return '';  // 変更なし
        }
        
        return this.generateANSI(changes);
    }

    /**
     * 差分検出
     */
    private detectChanges(gridData: number[]): GridChange[] {
        const changes: GridChange[] = [];
        
        // 表示範囲のみチェック
        for (let y = 0; y < this.displayHeight; y++) {
            for (let x = 0; x < this.displayWidth; x++) {
                const index = y * this.width + x;
                const currentValue = gridData[index] ?? 0;
                const lastValue = this.lastFrame[index] ?? 0;
                
                if (currentValue !== lastValue) {
                    changes.push({ x, y, value: currentValue });
                    this.lastFrame[index] = currentValue;
                }
            }
        }
        
        return changes;
    }

    /**
     * ANSIエスケープシーケンス生成
     */
    private generateANSI(changes: GridChange[]): string {
        let output = '';
        
        for (const { x, y, value } of changes) {
            // カーソル位置: ヘッダー2行 + グリッド行、左マージン3文字分（Y座標 + 空白 + '|'）
            const line = y + 3;  // ヘッダー（1行）+ 区切り線（1行）+ データ開始（1行目=3）
            const column = x * 2 + 4;  // 左マージン3文字（"Y |"）+ x座標 * 2（文字 + 空白）+ 1
            
            // ESC[line;columnH で移動して文字描画
            output += `\x1b[${line};${column}H${this.valueToChar(value)}`;
        }
        
        // カーソルを画面下部に移動（グリッド表示の下）
        const statusLine = this.displayHeight + 4;
        output += `\x1b[${statusLine};1H`;
        
        return output;
    }

    /**
     * 数値をASCII文字に変換 (0-255の値を輝度階調で表現)
     * 空セル以外は2文字幅で描画
     */
    private valueToChar(value: number): string {
        if (value === 0) return '. ';   // 空白/黒 (0) - 空白付き
        if (value <= 32) return '░░';   // 薄い (1-32) - 2文字
        if (value <= 96) return '▒▒';   // 中間薄い (33-96) - 2文字
        if (value <= 160) return '▓▓';  // 中間濃い (97-160) - 2文字
        if (value <= 224) return '██';  // 濃い (161-224) - 2文字
        return '██'; // 最大/白 (225-255) - 2文字
    }

    /**
     * 全体を強制再描画
     */
    fullRedraw(gridData: number[]): string {
        // lastFrameをリセット
        this.lastFrame.fill(-1);
        
        // 初期画面 + 全差分描画
        return this.initScreen() + this.renderDiff(gridData);
    }

    /**
     * 統計情報を取得
     */
    getStats(changes: GridChange[]): { totalCells: number; changedCells: number; changeRate: number } {
        const totalCells = this.displayWidth * this.displayHeight;
        const changedCells = changes.length;
        const changeRate = changedCells / totalCells;
        
        return { totalCells, changedCells, changeRate };
    }

    /**
     * カーソルを非表示にする
     */
    static hideCursor(): string {
        return '\x1b[?25l';
    }

    /**
     * カーソルを表示する
     */
    static showCursor(): string {
        return '\x1b[?25h';
    }

    /**
     * 画面クリア
     */
    static clearScreen(): string {
        return '\x1b[2J\x1b[H';
    }
}
