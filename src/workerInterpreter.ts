// src/workerInterpreter.ts

/**
 * インタプリタの実行状態を保持するインターフェース。
 * Generator Function内で状態を管理するために使用されます。
 */
interface InterpreterState {
    programCounter: number; // 現在の実行行/ステートメントのインデックス
    variables: Map<string, number>; // ユーザー変数 (A-Z)
    systemVariables: Map<string, number>; // システム変数 (%, X, Yなど)
    callStack: number[]; // GOSUBのリターンアドレススタック
    loopStack: LoopInfo[]; // FORループの状態スタック
    // ... その他、インタプリタが必要とする状態
}

/**
 * FORループの状態を保持するインターフェース。
 */
interface LoopInfo {
    variable: string; // ループ変数名 (例: "I")
    start: number;    // 開始値
    end: number;      // 終了値
    step: number;     // ステップ値
    nextStatementIndex: number; // NEXTステートメントの次の実行位置 (ループの先頭に戻るためのPC)
}

/**
 * WorkerScriptインタプリタのコアクラス。
 * スクリプトのロード、解析、および1ステートメントごとの実行を制御します。
 */
class WorkerInterpreter {
    private scriptLines: string[] = []; // 解析済みのスクリプト行
    private labels: Map<string, number> = new Map(); // ラベル名と行番号のマッピング

    /**
     * WorkerInterpreterの新しいインスタンスを初期化します。
     * 外部APIやグリッドデータは依存性注入されます。
     * @param gridData グリッドデータを保持する数値配列。
     * @param peekFn gridDataから値を読み出す関数。
     * @param pokeFn gridDataに値を書き込み、再描画をトリガーする関数。
     * @param logFn トランスクリプトエリアに出力する関数。
     */
    constructor(
        private gridData: number[],
        private peekFn: (index: number) => number,
        private pokeFn: (index: number, value: number) => void,
        private logFn: (...args: any[]) => void
    ) {
        // コンストラクタでの初期化は最小限に留め、
        // スクリプトの解析はloadScriptメソッドで行います。
    }

    /**
     * WorkerScriptコードをロードし、字句解析と構文解析を行います。
     * このメソッドは実行前に一度呼び出す必要があります。
     * @param script ロードするWorkerScriptコードの文字列。
     * @throws {Error} 構文エラーや重複ラベルなどの問題が見つかった場合。
     */
    loadScript(script: string): void {
        // TODO: 実際の字句解析、構文解析、ラベルの抽出、エラーチェックを実装
        // 現時点では、単純に行に分割するのみ
        this.scriptLines = script.split('\n');
        this.labels.clear(); // 既存のラベルをクリア

        // 仮のラベル抽出ロジック（実際の実装ではより堅牢な解析が必要）
        this.scriptLines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('^')) {
                const labelName = trimmedLine.split(/\s/)[0]; // スペースまでをラベル名とする
                if (this.labels.has(labelName)) {
                    throw new Error(`構文エラー: ラベル '${labelName}' が重複して定義されています。`);
                }
                this.labels.set(labelName, index);
            }
        });

        // TODO: その他の構文エラーチェック（例: 未定義コマンド、不正な式など）
        this.logFn("スクリプトがロードされました。");
    }

    /**
     * WorkerScriptの実行を制御するGenerator Functionを返します。
     * Generatorのnext()が呼び出されるたびに、1つのステートメントが実行されます。
     * @returns Generator<boolean, void, unknown> Generatorオブジェクト。
     *          yieldされるbooleanは、実行が継続可能かどうかを示します。
     *          実行完了時はdone: trueとなります。
     */
    *run(): Generator<boolean, void, unknown> {
        const state: InterpreterState = {
            programCounter: 0,
            variables: new Map<string, number>(),
            systemVariables: new Map<string, number>([
                ['#', 0], // プログラム開始位置を指す
                ['%', 0],
                ['X', 0],
                ['Y', 0],
            ]),
            callStack: [],
            loopStack: [],
        };

        // ユーザー変数の初期化 (A-Zを0に)
        for (let i = 0; i < 26; i++) {
            const charCode = 'A'.charCodeAt(0) + i;
            state.variables.set(String.fromCharCode(charCode), 0);
        }

        while (state.programCounter < this.scriptLines.length) {
            const currentLine = this.scriptLines[state.programCounter];
            const trimmedLine = currentLine.trim();

            // コメント行や空行、ラベル定義行はスキップ
            if (trimmedLine.startsWith(':') || trimmedLine === '' || trimmedLine.startsWith('^')) {
                state.programCounter++;
                continue;
            }

            try {
                // 1ステートメントの実行
                this.executeStatement(trimmedLine, state);
            } catch (error: any) {
                this.logFn(`実行時エラー: ${error.message} (行: ${state.programCounter + 1})`);
                state.systemVariables.set('#', -1); // エラーで停止
            }

            // プログラム停止コマンド (#=-1) が実行された場合
            if (state.systemVariables.get('#') === -1) {
                this.logFn("プログラムが停止しました。");
                return; // 実行完了
            }

            // 実行が継続可能であることを外部に通知
            yield true; // true は「まだ実行中」を示す
        }

        this.logFn("プログラムが終了しました。");
        return; // 実行完了
    }

    /**
     * 単一のステートメントを実行します。
     * このメソッドはGenerator Functionの内部から呼び出されます。
     * @param line 実行するステートメントの文字列。
     * @param state 現在のインタプリタの状態。
     * @throws {Error} 実行時エラーが発生した場合。
     */
    private executeStatement(line: string, state: InterpreterState): void {
        // TODO: ここにWorkerScriptの各コマンドの実行ロジックを実装
        // 例: 代入、出力、条件分岐、制御フロー、メモリ操作など

        // 仮の処理: 何も実行せず、プログラムカウンタを進めるだけ
        // 実際のインタプリタでは、lineを解析し、適切なアクションを実行します。
        this.logFn(`実行: ${line}`); // デバッグ用
        state.programCounter++; // 次のステートメントへ
    }

    // TODO: 必要に応じて、式評価、変数解決などのヘルパーメソッドを追加
    // private evaluateExpression(expression: string, state: InterpreterState): number | string { ... }
    // private getVariableValue(name: string, state: InterpreterState): number { ... }
    // private setVariableValue(name: string, value: number, state: InterpreterState): void { ... }
}

export default WorkerInterpreter;
