// src/gridRenderer.ts - グリッドをASCII文字で表示するクラス

export class GridRenderer {
    private width: number;
    private height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    /**
     * グリッドデータをASCII文字列に変換
     * @param gridData グリッドデータ配列
     * @param compact コンパクト表示（10x10サンプル）
     * @returns ASCII文字列
     */
    renderToString(gridData: number[], compact: boolean = true): string {
        if (compact) {
            return this.renderCompact(gridData);
        }
        return this.renderFull(gridData);
    }

    /**
     * コンパクト表示（最初の10x10セルを1:1表示）
     * 座標系: X=列（横方向）、Y=行（縦方向）
     * ヘッダー行はX座標、左側の数字はY座標
     * 縦横比改善のため文字間に空白を挿入
     */
    private renderCompact(gridData: number[]): string {
        const lines: string[] = [];

        // ヘッダー行（X座標 0-9）文字間に空白挿入
        lines.push('   0 1 2 3 4 5 6 7 8 9');
        lines.push('   -------------------');

        for (let y = 0; y < 10; y++) {  // Y座標（行）
            let line = `${y} |`;         // 左側にY座標を表示
            for (let x = 0; x < 10; x++) {  // X座標（列）
                const index = y * this.width + x;  // 行優先のインデックス
                const value = (index < gridData.length) ? gridData[index] || 0 : 0;
                line += this.valueToChar(value);
                if (x < 9) {  // 最後の文字以外は空白を追加
                    line += ' ';
                }
            }
            lines.push(line);
        }

        return lines.join('\n');
    }

    /**
     * 完全表示（全100x100）
     */
    private renderFull(gridData: number[]): string {
        const lines: string[] = [];

        for (let y = 0; y < this.height; y++) {
            let line = '';
            for (let x = 0; x < this.width; x++) {
                const index = y * this.width + x;
                const value = (index < gridData.length) ? gridData[index] || 0 : 0;
                line += this.valueToChar(value);
            }
            lines.push(line);
        }

        return lines.join('\n');
    }

    /**
     * 数値をASCII文字に変換 (0-255の値を輝度階調で表現)
     * @param value 0-255の値
     * @returns 対応する文字
     */
    private valueToChar(value: number): string {
        if (value === 0) return '.';   // 空白/黒 (0)
        if (value <= 32) return '░';   // 薄い (1-32)
        if (value <= 96) return '▒';   // 中間薄い (33-96) 
        if (value <= 160) return '▓';  // 中間濃い (97-160)
        if (value <= 224) return '█';  // 濃い (161-224)
        return '█'; // 最大/白 (225-255)
    }

    /**
     * グリッドの統計情報を取得
     */
    getStats(gridData: number[]): { total: number; filled: number; fillRate: number } {
        const total = this.width * this.height;
        const filled = gridData.filter(v => v > 0).length;
        const fillRate = filled / total;
        
        return { total, filled, fillRate };
    }

    /**
     * グリッドデータを色で分類
     */
    analyzeColors(gridData: number[]): Map<number, number> {
        const colorMap = new Map<number, number>();
        
        for (const value of gridData) {
            colorMap.set(value, (colorMap.get(value) || 0) + 1);
        }
        
        return colorMap;
    }
}