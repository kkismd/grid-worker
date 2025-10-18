/**
 * メモリ空間管理クラス
 * WorkerScriptの配列とスタック操作を管理します。
 * 
 * VTL仕様：
 * - 共有メモリ空間: 65536ワード（16bit符号付き整数）
 * - 配列：インデックス0-65535でアクセス可能
 * - スタック：メモリの最上位（65535）から下方向に成長
 * - スタックポインタ：現在のスタックトップを指す（初期値：65535）
 */
export class MemorySpace {
    private memory: Int16Array = new Int16Array(65536);  // 共有メモリ空間
    private stackPointer: number = 65535;                // スタックポインタ（内部管理）
    
    /**
     * 配列から値を読み取ります。
     * @param index 配列インデックス（0-65535）
     * @returns 読み取った値（16bit符号付き整数）
     */
    readArray(index: number): number {
        const normalizedIndex = index & 0xFFFF; // 0-65535に正規化
        return this.memory[normalizedIndex] || 0;
    }
    
    /**
     * 配列に値を書き込みます。
     * @param index 配列インデックス（0-65535）
     * @param value 書き込む値（16bit符号付き整数）
     */
    writeArray(index: number, value: number): void {
        const normalizedIndex = index & 0xFFFF; // 0-65535に正規化
        this.memory[normalizedIndex] = value & 0xFFFF; // 16bitに正規化
    }
    
    /**
     * 配列初期化：連続する複数の値をメモリに書き込みます。
     * @param startIndex 開始インデックス
     * @param values 書き込む値の配列
     */
    initializeArray(startIndex: number, values: number[]): void {
        let index = startIndex & 0xFFFF; // 0-65535に正規化
        for (const value of values) {
            this.memory[index] = value & 0xFFFF; // 16bitに正規化
            index = (index + 1) & 0xFFFF; // 次のインデックス（ラップアラウンド対応）
        }
    }
    
    /**
     * スタックに値をプッシュします。
     * @param value プッシュする値
     */
    pushStack(value: number): void {
        this.memory[this.stackPointer] = value & 0xFFFF;
        this.stackPointer = (this.stackPointer - 1) & 0xFFFF;
        // 注意: スタックオーバーフローのチェックなし（VTL仕様に準拠）
    }
    
    /**
     * スタックから値をポップします。
     * @returns ポップした値
     */
    popStack(): number {
        this.stackPointer = (this.stackPointer + 1) & 0xFFFF;
        return this.memory[this.stackPointer] || 0;
        // 注意: スタックアンダーフローのチェックなし（VTL仕様に準拠）
    }
    
    /**
     * 現在のスタックポインタを取得します（デバッグ・システム変数用）。
     * @returns 現在のスタックポインタ値（0-65535）
     */
    getStackPointer(): number {
        return this.stackPointer;
    }
    
    /**
     * スタックポインタを設定します（システム変数用）。
     * @param value 新しいスタックポインタ値
     */
    setStackPointer(value: number): void {
        this.stackPointer = value & 0xFFFF; // 0-65535に正規化
    }
    
    /**
     * メモリをリセットします（テスト用）。
     */
    reset(): void {
        this.memory.fill(0);
        this.stackPointer = 65535;
    }
}
