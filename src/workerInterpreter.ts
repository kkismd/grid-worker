// src/workerInterpreter.ts

import { Lexer, type Token } from './lexer.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 型アノテーションで使用（インライン型定義）
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral, Line } from './ast.js';
import { MemorySpace } from './memorySpace.js';
import { Parser } from './parser.js';

/**
 * ブロック構造ループの実行状態を保持するインターフェース。
 * 
 * マルチワーカー協調動作のため、ループ内の各ステートメントごとにyieldする必要があります。
 * このインターフェースはループの実行状態を保持し、next()呼び出しごとに1ステートメントずつ実行します。
 */
interface LoopBlockInfo {
    type: 'for' | 'while'; // ループの種類
    variable?: string; // ループ変数名 (FORの場合のみ)
    start?: number; // 開始値 (FORのみ)
    end?: number; // 終了値 (FORのみ)
    step?: number; // ステップ値 (FORのみ)
    condition?: Expression; // WHILE条件式 (WHILEのみ)
    body: Statement[]; // ループ本体のステートメント配列
    bodyIndex: number; // 現在実行中のステートメントインデックス
    currentValue?: number; // 現在のループ変数値 (FORのみ)
}

/**
 * ステートメント実行結果を表すインターフェース。
 * ジャンプ、停止、スキップの情報を保持します。
 */
interface ExecutionResult {
    jump: boolean;         // GOTO/GOSUB/RETURNによるジャンプが発生したか
    halt: boolean;         // HaltStatementによるプログラム停止か
    skipRemaining: boolean; // IF条件が偽の場合、この行の残りをスキップするか
}

/**
 * WorkerScriptインタプリタのコアクラス。
 * スクリプトのロード、解析、および1ステートメントごとの実行を制御します。
 */
class WorkerInterpreter {
    private scriptLines: string[] = []; // 解析済みのスクリプト行
    private labels: Map<string, number> = new Map(); // ラベル名と行番号のマッピング
    private tokens: Token[][] = []; // 各行のトークンリストを保持
    private program: Program | null = null; // 構築されたプログラムAST
    private lexer: Lexer; // Lexerのインスタンス
    private parser: Parser; // Parserのインスタンス
    private gridData: number[];
    private peekFn: (index: number) => number;
    private pokeFn: (x: number, y: number, value: number) => void;
    private logFn: (...args: any[]) => void;
    private getFn: (() => number) | undefined; // 1byte入力関数（0-255の値を返す）
    private putFn: ((value: number) => void) | undefined; // 1byte出力関数（0-255の値を受け取る）
    private variables: Map<string, number> = new Map(); // 変数の状態 (A-Z)
    private currentLineIndex: number = 0; // 現在実行中の行インデックス
    private callStack: number[] = []; // GOSUBのリターンアドレススタック（行番号のみ）
    private loopStack: LoopBlockInfo[] = []; // ループブロックの実行状態スタック
    private memorySpace: MemorySpace; // メモリ空間（配列・スタック）
    
    // NOTE: currentLineIndex と callStack は行ベースの実装です。
    // 同じ行内の複数ステートメント間でのジャンプはサポートされていません。
    // ループやサブルーチンからの復帰は常に「行の次のステートメント」に戻ります。

    /**
     * WorkerInterpreterの新しいインスタンスを初期化します。
     * 外部APIやグリッドデータは依存性注入されます。
     * @param config 設定オブジェクト
     */
    constructor(config: {
        gridData: number[];
        peekFn: (index: number) => number;
        pokeFn: (x: number, y: number, value: number) => void;
        logFn: (...args: any[]) => void;
        getFn?: () => number; // 1byte入力関数（0-255の値を返す）
        putFn?: (value: number) => void; // 1byte出力関数（0-255の値を受け取る）
    }) {
        this.gridData = config.gridData;
        this.peekFn = config.peekFn;
        this.pokeFn = config.pokeFn;
        this.logFn = config.logFn;
        this.getFn = config.getFn;
        this.putFn = config.putFn;
        this.lexer = new Lexer(); // Lexerのインスタンスを初期化
        this.parser = new Parser(); // Parserのインスタンスを初期化
        this.memorySpace = new MemorySpace(); // メモリ空間の初期化
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
        // Parserを使用して解析
        const parseResult = this.parser.parse(script);
        this.program = parseResult.program;
        this.labels = parseResult.labels;
        
        // scriptLinesも保持（実行時のエラーメッセージ用）
        this.scriptLines = script.split('\n');
    }

    /**
     * 全行のトークンからProgramASTを構築します。
     */

    /**
     * 構築されたプログラムASTを取得します。
     * @returns Program ASTまたはnull（未構築の場合）
     */
    getProgram(): Program | null {
        return this.program;
    }

    /**
     * 指定された行番号のLine ASTを取得します。
     * @param lineNumber 取得する行番号（0-indexed）
     * @returns Line ASTまたはundefined（存在しない場合）
     */
    getLineByNumber(lineNumber: number): Line | undefined {
        return this.program?.body.find(line => line.lineNumber === lineNumber);
    }

    /**
     * ラベル名から対応する行番号を取得します。
     * @param labelName ラベル名（例: "^LOOP"）
     * @returns 行番号またはundefined（存在しない場合）
     */
    getLabelLine(labelName: string): number | undefined {
        return this.labels.get(labelName);
    }

    /**
     * 式がカンマを含むBinaryExpressionかどうかを判定します。
     * @param expr 式
     * @returns カンマ式の場合true
     */
    private isCommaExpression(expr: Expression): boolean {
        return expr.type === 'BinaryExpression' && expr.operator === ',';
    }

    /**
     * カンマ式を展開して、コンマで区切られた部分式の配列を返します。
     * 例: (A,B),C → [A, B, C]
     * @param expr カンマを含むBinaryExpression
     * @returns 部分式の配列
     */
    private extractCommaExpressionParts(expr: Expression): Expression[] {
        if (expr.type !== 'BinaryExpression' || expr.operator !== ',') {
            return [expr];
        }
        
        // 左辺を再帰的に展開
        const leftParts = this.extractCommaExpressionParts(expr.left);
        // 右辺を再帰的に展開
        const rightParts = this.extractCommaExpressionParts(expr.right);
        
        return [...leftParts, ...rightParts];
    }

    // ==================== Phase 3: インタプリタ実装 ====================

    /**
     * ロードされたスクリプトを実行します（Generator Functionとして実装）。
     * 外部からのクロック（next()呼び出し）ごとに1ステートメントを実行します。
     * @yields 実行状態（継続可能かどうか）
     */
    public *run(): Generator<void, void, unknown> {
        if (!this.program) {
            throw new Error('スクリプトがロードされていません。loadScript()を先に呼び出してください。');
        }

        // 変数とステートをリセット
        this.variables.clear();
        this.currentLineIndex = 0;
        this.callStack = [];
        this.loopStack = [];

        // プログラム実行ループ（loopStackに処理が残っている場合も継続）
        while (this.currentLineIndex < this.program.body.length || this.loopStack.length > 0) {
            // loopStackがある場合、ループ内のステートメントを優先実行
            if (this.loopStack.length > 0) {
                const currentLoop = this.loopStack[this.loopStack.length - 1]!;
                
                // bodyIndex が body.length に達した場合、ループの次のイテレーション
                if (currentLoop.bodyIndex >= currentLoop.body.length) {
                    if (currentLoop.type === 'for') {
                        // FORループ: 変数を更新して条件チェック
                        const newValue = currentLoop.currentValue! + currentLoop.step!;
                        const shouldContinue = currentLoop.step! > 0
                            ? newValue <= currentLoop.end!
                            : newValue >= currentLoop.end!;
                        
                        if (shouldContinue) {
                            // 次のイテレーション
                            this.variables.set(currentLoop.variable!, newValue);
                            currentLoop.currentValue = newValue;
                            currentLoop.bodyIndex = 0;
                            
                            // 最初のステートメントを実行
                            if (currentLoop.body.length > 0) {
                                const stmt = currentLoop.body[0]!;
                                const result = this.executeStatement(stmt);
                                if (result.jump || result.halt) {
                                    if (result.halt) return;
                                }
                                currentLoop.bodyIndex = 1;
                                yield;
                                continue;
                            }
                        } else {
                            // ループ終了
                            this.loopStack.pop();
                            yield;
                            continue;
                        }
                    } else if (currentLoop.type === 'while') {
                        // WHILEループ: 条件を再評価
                        const condition = this.evaluateExpression(currentLoop.condition!);
                        
                        if (typeof condition === 'string') {
                            throw new Error('WHILEループの条件は数値でなければなりません');
                        }
                        
                        if (condition !== 0) {
                            // 次のイテレーション
                            currentLoop.bodyIndex = 0;
                            
                            // 最初のステートメントを実行
                            if (currentLoop.body.length > 0) {
                                const stmt = currentLoop.body[0]!;
                                const result = this.executeStatement(stmt);
                                if (result.jump || result.halt) {
                                    if (result.halt) return;
                                }
                                currentLoop.bodyIndex = 1;
                                yield;
                                continue;
                            }
                        } else {
                            // ループ終了
                            this.loopStack.pop();
                            yield;
                            continue;
                        }
                    }
                }
                
                // 次のステートメントを実行
                if (currentLoop.bodyIndex < currentLoop.body.length) {
                    const stmt = currentLoop.body[currentLoop.bodyIndex]!;
                    const result = this.executeStatement(stmt);
                    if (result.jump || result.halt) {
                        if (result.halt) return;
                    }
                    currentLoop.bodyIndex++;
                    yield;
                    continue;
                }
            }
            
            const line = this.program.body[this.currentLineIndex];
            if (!line) break;

            let skipRemaining = false;
            let jumped = false;

            for (const statement of line.statements) {
                if (skipRemaining) {
                    // IF条件が偽だった場合、この行の残りをスキップ
                    yield; // スキップされたステートメントもyieldする
                    continue;
                }
                
                const result = this.executeStatement(statement);
                
                // GOTO/GOSUB/RETURNの場合、currentLineIndexが変更される
                if (result.jump) {
                    // ジャンプ先が設定されている場合
                    jumped = true;
                    yield;
                    break; // この行の残りのステートメントをスキップしてジャンプ先へ
                }
                
                if (result.halt) {
                    // プログラム停止
                    return;
                }
                
                if (result.skipRemaining) {
                    skipRemaining = true;
                }
                
                // 1ステートメント実行後にyieldして制御を返す
                yield;
            }

            // ジャンプしていない場合のみ次の行へ進む
            if (!jumped) {
                this.currentLineIndex++;
            }
        }
    }

    // ==================== ステートメント実行メソッド ====================

    /**
     * 代入ステートメントを実行します。
     */
    private executeAssignment(statement: any): ExecutionResult {
        const value = this.evaluateExpression(statement.value);
        if (typeof value === 'string') {
            throw new Error('変数には数値のみを代入できます');
        }
        this.variables.set(statement.variable.name, value);
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 出力ステートメントを実行します。
     */
    private executeOutput(statement: any): ExecutionResult {
        const value = this.evaluateExpression(statement.expression);
        this.logFn(value);
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 改行ステートメントを実行します。
     */
    private executeNewline(): ExecutionResult {
        this.logFn('\n');
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * インラインIF文を実行します。
     */
    private executeIf(statement: any): ExecutionResult {
        const condition = this.evaluateExpression(statement.condition);
        if (typeof condition === 'string') {
            throw new Error('IF条件は数値でなければなりません');
        }
        // 条件が0（偽）の場合、この行の残りをスキップ
        if (condition === 0) {
            return { jump: false, halt: false, skipRemaining: true };
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * ブロックIF文を実行します。
     */
    private executeIfBlock(statement: any): ExecutionResult {
        const condition = this.evaluateExpression(statement.condition);
        if (typeof condition === 'string') {
            throw new Error('IF条件は数値でなければなりません');
        }
        
        // 条件が真（非0）の場合、thenBodyを実行
        if (condition !== 0) {
            for (const stmt of statement.thenBody || []) {
                const result = this.executeStatement(stmt);
                if (result.jump || result.halt) {
                    return result;
                }
            }
        } else {
            // 条件が偽（0）の場合、elseBodyを実行
            for (const stmt of statement.elseBody || []) {
                const result = this.executeStatement(stmt);
                if (result.jump || result.halt) {
                    return result;
                }
            }
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * FORブロック文を実行します。
     */
    private executeForBlock(statement: any): ExecutionResult {
        const forStmt = statement;
        const varName = forStmt.variable.name;
        const startValue = this.evaluateExpression(forStmt.start);
        const endValue = this.evaluateExpression(forStmt.end);
        const stepValue = forStmt.step 
            ? this.evaluateExpression(forStmt.step) 
            : 1;
        
        // 型チェック
        if (typeof startValue === 'string' || typeof endValue === 'string' || typeof stepValue === 'string') {
            throw new Error('FORループのパラメータは数値でなければなりません');
        }
        
        // ステップ値が0の場合はエラー
        if (stepValue === 0) {
            throw new Error('FORループのステップ値は0にできません');
        }
        
        // 初回のループ条件チェック
        const shouldExecute = stepValue > 0 
            ? startValue <= endValue 
            : startValue >= endValue;
        
        if (!shouldExecute) {
            // ループをスキップ（bodyを実行しない）
            return { jump: false, halt: false, skipRemaining: false };
        }
        
        // ループ変数に開始値を設定
        this.variables.set(varName, startValue);
        
        // ループ情報をスタックにpush（最初のステートメントは実行しない）
        this.loopStack.push({
            type: 'for',
            variable: varName,
            start: startValue,
            end: endValue,
            step: stepValue,
            body: forStmt.body,
            bodyIndex: 0,
            currentValue: startValue,
        });
        
        // run()のloopStack処理に任せる
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * WHILEブロック文を実行します。
     */
    private executeWhileBlock(statement: any): ExecutionResult {
        const whileStmt = statement;
        
        // 条件を評価
        const condition = this.evaluateExpression(whileStmt.condition);
        
        // 型チェック
        if (typeof condition === 'string') {
            throw new Error('WHILEループの条件は数値でなければなりません');
        }
        
        // 条件が偽ならループをスキップ
        if (condition === 0) {
            return { jump: false, halt: false, skipRemaining: false };
        }
        
        // ループ情報をスタックにpush（最初のステートメントは実行しない）
        this.loopStack.push({
            type: 'while',
            condition: whileStmt.condition,
            body: whileStmt.body,
            bodyIndex: 0,
        });
        
        // run()のloopStack処理に任せる
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * GOTO文を実行します。
     */
    private executeGoto(statement: any): ExecutionResult {
        const targetLine = this.labels.get(statement.target);
        if (targetLine === undefined) {
            throw new Error(`ラベル ${statement.target} が見つかりません`);
        }
        this.currentLineIndex = targetLine;
        return { jump: true, halt: false, skipRemaining: false };
    }

    /**
     * GOSUB文を実行します。
     */
    private executeGosub(statement: any): ExecutionResult {
        const targetLine = this.labels.get(statement.target);
        if (targetLine === undefined) {
            throw new Error(`ラベル ${statement.target} が見つかりません`);
        }
        // 現在の次の行をスタックにプッシュ
        // NOTE: 行ベースのリターンアドレス保存。同じ行の次のステートメント位置は保存されません。
        this.callStack.push(this.currentLineIndex + 1);
        this.currentLineIndex = targetLine;
        return { jump: true, halt: false, skipRemaining: false };
    }

    /**
     * RETURN文を実行します。
     */
    private executeReturn(): ExecutionResult {
        if (this.callStack.length === 0) {
            throw new Error('RETURN文がありますがGOSUBの呼び出しがありません');
        }
        const returnLine = this.callStack.pop()!;
        // NOTE: 行ベースのリターン。GOSUB呼び出しがあった行の次の行に戻ります。
        // 同じ行内の特定のステートメント位置には戻れません。
        this.currentLineIndex = returnLine;
        return { jump: true, halt: false, skipRemaining: false };
    }

    /**
     * HALT文を実行します。
     */
    private executeHalt(): ExecutionResult {
        return { jump: false, halt: true, skipRemaining: false };
    }

    /**
     * POKE文を実行します。
     */
    private executePoke(statement: any): ExecutionResult {
        // POKE: グリッドに書き込み
        // X, Y 変数を使ってgridDataに書き込む
        const x = this.variables.get('X') ?? 0;
        const y = this.variables.get('Y') ?? 0;
        
        // 値を評価
        const value = this.evaluateExpression(statement.value);
        
        // 文字列は不可
        if (typeof value === 'string') {
            throw new Error('POKEには数値が必要です');
        }
        
        // 値を0-65535の範囲にクランプ（16ビット値対応）
        const clampedValue = Math.max(0, Math.min(65535, Math.floor(value)));
        
        // pokeFnを呼び出し（X, Y座標と値を渡す）
        this.pokeFn(Math.floor(x), Math.floor(y), clampedValue);
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * IO PUT文（1byte出力）を実行します。
     */
    private executeIoPut(statement: any): ExecutionResult {
        // VTL互換 1byte出力: $システム変数に値を書き込み
        const value = this.evaluateExpression(statement.value);
        
        // 文字列は不可
        if (typeof value === 'string') {
            throw new Error('1byte出力には数値が必要です');
        }
        
        if (this.putFn) {
            // 値を0-255の範囲にクランプ
            const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
            this.putFn(clampedValue);
        } else {
            throw new Error('1byte出力機能が設定されていません');
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 配列代入文を実行します。
     */
    private executeArrayAssignment(statement: any): ExecutionResult {
        // 配列への代入: [index]=value または [-1]=value（スタックプッシュ）
        const value = this.evaluateExpression(statement.value);
        
        // 文字列は不可
        if (typeof value === 'string') {
            throw new Error('配列には数値のみを代入できます');
        }
        
        if (statement.isLiteral) {
            // [-1]=value: スタックにプッシュ
            this.memorySpace.pushStack(Math.floor(value));
        } else {
            // 通常の配列代入
            const index = this.evaluateExpression(statement.index);
            if (typeof index === 'string') {
                throw new Error('配列のインデックスは数値でなければなりません');
            }
            this.memorySpace.writeArray(Math.floor(index), Math.floor(value));
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 配列初期化文を実行します。
     */
    private executeArrayInitialization(statement: any): ExecutionResult {
        // 配列の初期化: [index]=value1,value2,value3,...
        const index = this.evaluateExpression(statement.index);
        
        // インデックスは数値でなければならない
        if (typeof index === 'string') {
            throw new Error('配列のインデックスは数値でなければなりません');
        }
        
        // 値を評価
        const values: number[] = [];
        for (const expr of statement.values) {
            const value = this.evaluateExpression(expr);
            if (typeof value === 'string') {
                throw new Error('配列初期化の値は数値でなければなりません');
            }
            values.push(Math.floor(value));
        }
        
        // 配列を初期化
        this.memorySpace.initializeArray(Math.floor(index), values);
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 単一のステートメントを実行します。
     * @param statement 実行するステートメント
     * @returns 実行結果（ジャンプ、停止、スキップの情報）
     */
    private executeStatement(statement: Statement): ExecutionResult {
        switch (statement.type) {
            case 'AssignmentStatement':
                return this.executeAssignment(statement);
            
            case 'OutputStatement':
                return this.executeOutput(statement);
            
            case 'NewlineStatement':
                return this.executeNewline();
            
            case 'IfStatement':
                return this.executeIf(statement);
            
            case 'IfBlockStatement':
                return this.executeIfBlock(statement);
            
            case 'ForBlockStatement':
                return this.executeForBlock(statement);
            
            case 'WhileBlockStatement':
                return this.executeWhileBlock(statement);
            
            case 'GotoStatement':
                return this.executeGoto(statement);
            
            case 'GosubStatement':
                return this.executeGosub(statement);
            
            case 'ReturnStatement':
                return this.executeReturn();
            
            case 'HaltStatement':
                return this.executeHalt();
            
            case 'PokeStatement':
                return this.executePoke(statement);

            case 'IoPutStatement':
                return this.executeIoPut(statement);

            case 'ArrayAssignmentStatement':
                return this.executeArrayAssignment(statement);

            case 'ArrayInitializationStatement':
                return this.executeArrayInitialization(statement);
            
            case 'ForStatement':
                // インラインスタイルのFORステートメント（例: @=I,1,3 ?=I #=@）
                // ブロックスタイルではForBlockStatementに変換される
                // インラインスタイルではこのステートメントは無視され、loopStackで処理される
                return { jump: false, halt: false, skipRemaining: false };
            
            case 'NextStatement':
                // NEXTステートメント（#=@）
                // ブロックスタイル: ForBlockStatement/WhileBlockStatementの終端として処理済み
                // インラインスタイル: loopStackで処理される
                // スタンドアロン: 対応するループがない場合は無視
                return { jump: false, halt: false, skipRemaining: false };
            
            case 'WhileStatement':
                // インラインスタイルのWHILEステートメント（例: @=(X<10) ?=X #=@）
                // ブロックスタイルではWhileBlockStatementに変換される
                // インラインスタイルではこのステートメントは無視され、loopStackで処理される
                return { jump: false, halt: false, skipRemaining: false };
            
            default:
                throw new Error(`未実装のステートメントタイプ: ${(statement as any).type}`);
        }
    }


    /**
     * 式を評価して数値または文字列を返します。
     * @param expr 評価する式
     * @returns 評価結果の数値または文字列
     */
    /**
     * 数値リテラルを評価
     */
    private evaluateNumericLiteral(expr: { type: 'NumericLiteral'; value: number }): number {
        return expr.value;
    }

    /**
     * 文字列リテラルを評価
     */
    private evaluateStringLiteral(expr: { type: 'StringLiteral'; value: string }): string {
        return expr.value;
    }

    /**
     * 識別子（変数）を評価
     */
    private evaluateIdentifier(expr: { type: 'Identifier'; name: string }): number {
        const value = this.variables.get(expr.name);
        if (value === undefined) {
            // 未初期化の変数は0として扱う
            return 0;
        }
        return value;
    }

    /**
     * 単項演算式を評価
     */
    private evaluateUnaryExpression(expr: { type: 'UnaryExpression'; operator: string; operand: Expression }): number {
        const operand = this.evaluateExpression(expr.operand);
        
        // 文字列を含む演算は未サポート
        if (typeof operand === 'string') {
            throw new Error('文字列演算はサポートされていません');
        }
        
        switch (expr.operator) {
            case '!': return operand === 0 ? 1 : 0; // NOT演算子
            case '-': return -operand; // 単項マイナス
            case '+': return operand; // 単項プラス
            default:
                // TypeScriptのexhaustive checkのため、到達不可能
                throw new Error(`未実装の単項演算子`);
        }
    }

    /**
     * 二項演算式を評価
     */
    private evaluateBinaryExpression(expr: { type: 'BinaryExpression'; operator: string; left: Expression; right: Expression }): number {
        const left = this.evaluateExpression(expr.left);
        const right = this.evaluateExpression(expr.right);
        
        // 文字列を含む演算は未サポート
        if (typeof left === 'string' || typeof right === 'string') {
            throw new Error('文字列演算はサポートされていません');
        }
        
        switch (expr.operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': 
                if (right === 0) {
                    throw new Error('ゼロ除算エラー');
                }
                return Math.floor(left / right); // 整数除算
            case '%':
                if (right === 0) {
                    throw new Error('ゼロ除算エラー（剰余演算）');
                }
                return ((left % right) + right) % right; // 正の剰余を保証
            
            // 比較演算子（真=1, 偽=0）
            case '>': return left > right ? 1 : 0;
            case '<': return left < right ? 1 : 0;
            case '>=': return left >= right ? 1 : 0;
            case '<=': return left <= right ? 1 : 0;
            case '=': return left === right ? 1 : 0;
            case '<>': return left !== right ? 1 : 0;
            
            // 論理演算子（0=偽, 非0=真）
            case '&': return (left !== 0 && right !== 0) ? 1 : 0;
            case '|': return (left !== 0 || right !== 0) ? 1 : 0;
            
            default:
                throw new Error(`未実装の演算子: ${expr.operator}`);
        }
    }

    /**
     * PEEK式を評価（グリッド読み取り）
     */
    private evaluatePeekExpression(): number {
        // PEEK: グリッドから読み取り
        // $の値は、X, Y システム変数を使ってgridDataから取得
        const x = this.variables.get('X') ?? 0;
        const y = this.variables.get('Y') ?? 0;
        
        // X, Yを0-99の範囲に正規化（負の値も対応）
        const xMod = ((Math.floor(x) % 100) + 100) % 100;
        const yMod = ((Math.floor(y) % 100) + 100) % 100;
        
        // グリッドインデックスを計算: x * 100 + y
        const index = xMod * 100 + yMod;
        
        // gridDataから値を読み取り
        return this.peekFn(index);
    }

    /**
     * ランダム式を評価
     */
    private evaluateRandomExpression(): number {
        // ランダム数生成: 0-32767の範囲
        return Math.floor(Math.random() * 32768);
    }

    /**
     * 文字リテラル式を評価（ASCIIコード変換）
     */
    private evaluateCharLiteralExpression(expr: { type: 'CharLiteralExpression'; value: string }): number {
        // 文字リテラルをASCIIコードに変換
        const charValue = expr.value;
        if (charValue.length === 1) {
            return charValue.charCodeAt(0);
        } else {
            // エスケープシーケンス等で処理済みの文字
            return charValue.charCodeAt(0);
        }
    }

    /**
     * IO GET式を評価（1byte入力）
     */
    private evaluateIoGetExpression(): number {
        // VTL互換 1byte入力: $システム変数から値を読み取り
        if (this.getFn) {
            const value = this.getFn();
            // 0-255の範囲に制限
            return Math.max(0, Math.min(255, Math.floor(value)));
        } else {
            throw new Error('1byte入力機能が設定されていません');
        }
    }

    /**
     * 配列アクセス式を評価
     */
    private evaluateArrayAccessExpression(expr: { type: 'ArrayAccessExpression'; index: Expression; isLiteral?: boolean }): number {
        // 配列アクセス: [index] または [-1]（スタック）
        if (expr.isLiteral) {
            // [-1]: スタックからpop
            return this.memorySpace.popStack();
        } else {
            // 通常の配列アクセス
            const index = this.evaluateExpression(expr.index);
            if (typeof index === 'string') {
                throw new Error('配列のインデックスは数値でなければなりません');
            }
            return this.memorySpace.readArray(Math.floor(index));
        }
    }

    private evaluateExpression(expr: Expression): number | string {
        switch (expr.type) {
            case 'NumericLiteral':
                return this.evaluateNumericLiteral(expr as any);
            
            case 'StringLiteral':
                return this.evaluateStringLiteral(expr as any);
            
            case 'Identifier':
                return this.evaluateIdentifier(expr as any);
            
            case 'UnaryExpression':
                return this.evaluateUnaryExpression(expr as any);
            
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(expr as any);
            
            case 'PeekExpression':
                return this.evaluatePeekExpression();
            
            case 'RandomExpression':
                return this.evaluateRandomExpression();

            case 'CharLiteralExpression':
                return this.evaluateCharLiteralExpression(expr as any);

            case 'IoGetExpression':
                return this.evaluateIoGetExpression();

            case 'ArrayAccessExpression':
                return this.evaluateArrayAccessExpression(expr as any);
            
            default:
                throw new Error(`未実装の式タイプ: ${(expr as any).type}`);
        }
    }

    /**
     * 変数の現在値を取得します（テスト用）。
     * @param name 変数名 (A-Z)
     * @returns 変数の値（未初期化の場合は0）
     */
    public getVariable(name: string): number {
        return this.variables.get(name) ?? 0;
    }
}

export default WorkerInterpreter;
