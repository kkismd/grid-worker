// src/workerInterpreter.ts

import { Lexer, type Token } from './lexer.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 型アノテーションで使用（インライン型定義）
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral, Line, ForBlockStatement, WhileBlockStatement } from './ast.js';
import { MemorySpace } from './memorySpace.js';
import { Parser } from './parser.js';

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
    private getLineFn: (() => string) | undefined; // 行入力関数（文字列を返す、A=?用）
    private variables: Map<string, number> = new Map(); // 変数の状態 (A-Z)
    private currentLineIndex: number = 0; // 現在実行中の行インデックス
    private callStack: number[] = []; // GOSUBのリターンアドレススタック（行番号のみ）
    private memorySpace: MemorySpace; // メモリ空間（配列・スタック）
    private statementExecutors: Map<string, (statement: any) => ExecutionResult> = new Map(); // ステートメントタイプと実行関数のマッピング
    private expressionEvaluators: Map<string, (expr: any) => number | string> = new Map(); // 式タイプと評価関数のマッピング
    
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
        getLineFn?: () => string; // 行入力関数（文字列を返す、A=?用）
    }) {
        this.gridData = config.gridData;
        this.peekFn = config.peekFn;
        this.pokeFn = config.pokeFn;
        this.logFn = config.logFn;
        this.getFn = config.getFn;
        this.putFn = config.putFn;
        this.getLineFn = config.getLineFn;
        this.lexer = new Lexer(); // Lexerのインスタンスを初期化
        this.parser = new Parser(); // Parserのインスタンスを初期化
        this.memorySpace = new MemorySpace(); // メモリ空間の初期化
        // コンストラクタでの初期化は最小限に留め、
        // スクリプトの解析はloadScriptメソッドで行います。
        
        // ステートメント実行関数のマッピング
        this.initializeStatementExecutors();
    }
    
    /**
     * ステートメント実行関数のマッピングを初期化します。
     * Map-basedディスパッチパターンにより、switch文を排除し保守性を向上させます。
     */
    private initializeStatementExecutors(): void {
        this.statementExecutors.set('AssignmentStatement', (s) => this.executeAssignment(s));
        this.statementExecutors.set('OutputStatement', (s) => this.executeOutput(s));
        this.statementExecutors.set('NewlineStatement', () => this.executeNewline());
        this.statementExecutors.set('IfStatement', (s) => this.executeIf(s));
        this.statementExecutors.set('IfBlockStatement', (s) => this.executeIfBlock(s));
        // ForBlockStatement と WhileBlockStatement は executeStatements() 内で直接 Generator 処理される
        this.statementExecutors.set('GotoStatement', (s) => this.executeGoto(s));
        this.statementExecutors.set('GosubStatement', (s) => this.executeGosub(s));
        this.statementExecutors.set('ReturnStatement', () => this.executeReturn());
        this.statementExecutors.set('HaltStatement', () => this.executeHalt());
        this.statementExecutors.set('PokeStatement', (s) => this.executePoke(s));
        this.statementExecutors.set('IoPutStatement', (s) => this.executeIoPut(s));
        this.statementExecutors.set('ArrayAssignmentStatement', (s) => this.executeArrayAssignment(s));
        this.statementExecutors.set('ArrayInitializationStatement', (s) => this.executeArrayInitialization(s));
        
        // 式評価関数のマッピング
        this.expressionEvaluators.set('NumericLiteral', (e) => this.evaluateNumericLiteral(e));
        this.expressionEvaluators.set('StringLiteral', (e) => this.evaluateStringLiteral(e));
        this.expressionEvaluators.set('Identifier', (e) => this.evaluateIdentifier(e));
        this.expressionEvaluators.set('UnaryExpression', (e) => this.evaluateUnaryExpression(e));
        this.expressionEvaluators.set('BinaryExpression', (e) => this.evaluateBinaryExpression(e));
        this.expressionEvaluators.set('PeekExpression', () => this.evaluatePeekExpression());
        this.expressionEvaluators.set('RandomExpression', () => this.evaluateRandomExpression());
        this.expressionEvaluators.set('CharLiteralExpression', (e) => this.evaluateCharLiteralExpression(e));
        this.expressionEvaluators.set('IoGetExpression', () => this.evaluateIoGetExpression());
        this.expressionEvaluators.set('InputNumberExpression', () => this.evaluateInputNumberExpression());
        this.expressionEvaluators.set('ArrayAccessExpression', (e) => this.evaluateArrayAccessExpression(e));
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
     * ステートメント列を統一的に実行するGeneratorメソッド。
     * すべてのブロック構造（FOR, WHILE, IF）で共通して使用されます。
     * 
     * @param statements 実行するステートメント列
     * @returns ExecutionResult（jump, halt, skipRemainingの情報）
     * @yields 各ステートメント実行後に制御を返す
     */
    private *executeStatements(statements: Statement[]): Generator<void, ExecutionResult, void> {
        for (const stmt of statements) {
            // ブロック系ステートメントは専用のGeneratorヘルパーで処理
            if (stmt.type === 'ForBlockStatement') {
                const result = yield* this.executeForBlockGenerator(stmt);
                if (result.jump || result.halt) {
                    return result;
                }
            } else if (stmt.type === 'WhileBlockStatement') {
                const result = yield* this.executeWhileBlockGenerator(stmt);
                if (result.jump || result.halt) {
                    return result;
                }
            } else {
                // 通常のステートメント実行
                const result = this.executeStatement(stmt);
                
                // jump/haltの場合は即座に呼び出し元に伝播
                if (result.jump || result.halt) {
                    return result;
                }
            }
            
            // 1ステートメント実行完了、制御を返す
            yield;
        }
        
        // 正常終了
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * FORブロックをGenerator方式で実行するヘルパー
     */
    private *executeForBlockGenerator(statement: ForBlockStatement): Generator<void, ExecutionResult, void> {
        const varName = statement.variable.name;
        const startValue = this.assertNumber(
            this.evaluateExpression(statement.start),
            'FORループのパラメータは数値でなければなりません'
        );
        const endValue = this.assertNumber(
            this.evaluateExpression(statement.end),
            'FORループのパラメータは数値でなければなりません'
        );
        const stepValue = statement.step 
            ? this.assertNumber(
                this.evaluateExpression(statement.step),
                'FORループのパラメータは数値でなければなりません'
            )
            : 1;
        
        // ステップ値が0の場合はエラー
        if (stepValue === 0) {
            throw new Error('FORループのステップ値は0にできません');
        }
        
        // ループ変数の初期値を設定
        this.variables.set(varName, startValue);
        
        // ループ実行
        for (let currentValue = startValue; 
             stepValue > 0 ? currentValue <= endValue : currentValue >= endValue; 
             currentValue += stepValue) {
            
            // ループ変数を更新
            this.variables.set(varName, currentValue);
            
            // ━━━━ ブロック内のステートメントを再帰的に実行 ━━━━
            const result = yield* this.executeStatements(statement.body);
            
            if (result.jump || result.halt) {
                return result;
            }
        }
        
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * WHILEブロックをGenerator方式で実行するヘルパー
     */
    private *executeWhileBlockGenerator(statement: WhileBlockStatement): Generator<void, ExecutionResult, void> {
        // WHILEループ実行
        while (true) {
            // 条件を評価
            const condition = this.assertNumber(
                this.evaluateExpression(statement.condition),
                'WHILEループの条件は数値でなければなりません'
            );
            
            // 条件が偽ならループ終了
            if (condition === 0) {
                break;
            }
            
            // ━━━━ ブロック内のステートメントを再帰的に実行 ━━━━
            const result = yield* this.executeStatements(statement.body);
            
            if (result.jump || result.halt) {
                return result;
            }
        }
        
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * ロードされたスクリプトを実行します（Generator Functionとして実装）。
     * 外部からのクロック（next()呼び出し）ごとに1ステートメントを実行します。
     * @yields 実行状態（継続可能かどうか）
     */
    public *run(): Generator<void, void, void> {
        if (!this.program) {
            throw new Error('スクリプトがロードされていません。loadScript()を先に呼び出してください。');
        }

        // 変数とステートをリセット
        this.variables.clear();
        this.currentLineIndex = 0;
        this.callStack = [];

        // シンプルな行ベース実行ループ
        while (this.currentLineIndex < this.program.body.length) {
            const line = this.program.body[this.currentLineIndex];
            if (!line) break;

            // executeStatements()を使って行内のステートメントを実行
            const result = yield* this.executeStatements(line.statements);
            
            if (result.halt) {
                return;
            }
            
            // ジャンプしていない場合のみ次の行へ
            if (!result.jump) {
                this.currentLineIndex++;
            }
        }
    }

    // ==================== ヘルパーメソッド ====================

    /**
     * 値が数値であることを検証します。
     * @param value 検証する値
     * @param errorMessage 文字列だった場合のエラーメッセージ
     * @returns 数値として検証された値
     * @throws {Error} 値が文字列の場合
     */
    private assertNumber(value: number | string, errorMessage: string): number {
        if (typeof value === 'string') {
            throw new Error(errorMessage);
        }
        return value;
    }

    // ==================== ステートメント実行メソッド ====================

    /**
     * 代入ステートメントを実行します。
     */
    private executeAssignment(statement: any): ExecutionResult {
        const value = this.assertNumber(
            this.evaluateExpression(statement.value),
            '変数には数値のみを代入できます'
        );
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
        const condition = this.assertNumber(
            this.evaluateExpression(statement.condition),
            'IF条件は数値でなければなりません'
        );
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
        const condition = this.assertNumber(
            this.evaluateExpression(statement.condition),
            'IF条件は数値でなければなりません'
        );
        
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
        const value = this.assertNumber(
            this.evaluateExpression(statement.value),
            'POKEには数値が必要です'
        );
        
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
        const value = this.assertNumber(
            this.evaluateExpression(statement.value),
            '1byte出力には数値が必要です'
        );
        
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
        const value = this.assertNumber(
            this.evaluateExpression(statement.value),
            '配列には数値のみを代入できます'
        );
        
        if (statement.isLiteral) {
            // [-1]=value: スタックにプッシュ
            this.memorySpace.pushStack(Math.floor(value));
        } else {
            // 通常の配列代入
            const index = this.assertNumber(
                this.evaluateExpression(statement.index),
                '配列のインデックスは数値でなければなりません'
            );
            this.memorySpace.writeArray(Math.floor(index), Math.floor(value));
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 配列初期化文を実行します。
     */
    private executeArrayInitialization(statement: any): ExecutionResult {
        // 配列の初期化: [index]=value1,value2,value3,...
        const index = this.assertNumber(
            this.evaluateExpression(statement.index),
            '配列のインデックスは数値でなければなりません'
        );
        
        // 値を評価
        const values: number[] = [];
        for (const expr of statement.values) {
            const value = this.assertNumber(
                this.evaluateExpression(expr),
                '配列初期化の値は数値でなければなりません'
            );
            values.push(Math.floor(value));
        }
        
        // 配列を初期化
        this.memorySpace.initializeArray(Math.floor(index), values);
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 単一のステートメントを実行します。
     * Map-basedディスパッチパターンにより、switch文を排除し保守性を向上させます。
     * @param statement 実行するステートメント
     * @returns 実行結果（ジャンプ、停止、スキップの情報）
     */
    private executeStatement(statement: Statement): ExecutionResult {
        const executor = this.statementExecutors.get(statement.type);
        if (!executor) {
            throw new Error(`未実装のステートメントタイプ: ${(statement as any).type}`);
        }
        return executor(statement);
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
        const operand = this.assertNumber(
            this.evaluateExpression(expr.operand),
            '文字列演算はサポートされていません'
        );
        
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
        const left = this.assertNumber(
            this.evaluateExpression(expr.left),
            '文字列演算はサポートされていません'
        );
        const right = this.assertNumber(
            this.evaluateExpression(expr.right),
            '文字列演算はサポートされていません'
        );
        
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
     * 数値入力式を評価（行入力 + atoi）
     */
    private evaluateInputNumberExpression(): number {
        // C言語の fgets() + atoi() 相当
        if (this.getLineFn) {
            const line = this.getLineFn();
            const value = parseInt(line.trim(), 10);
            // NaNの場合は0を返す
            if (isNaN(value)) {
                return 0;
            }
            // 16ビット符号あり整数にラップアラウンド
            // JavaScriptのビット演算で自動的に32ビット整数に変換され、その後16ビットに切り詰める
            return (value << 16) >> 16;
        } else {
            throw new Error('行入力機能が設定されていません');
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
            const index = this.assertNumber(
                this.evaluateExpression(expr.index),
                '配列のインデックスは数値でなければなりません'
            );
            return this.memorySpace.readArray(Math.floor(index));
        }
    }

    private evaluateExpression(expr: Expression): number | string {
        const evaluator = this.expressionEvaluators.get(expr.type);
        if (!evaluator) {
            throw new Error(`未実装の式タイプ: ${(expr as any).type}`);
        }
        return evaluator(expr);
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
