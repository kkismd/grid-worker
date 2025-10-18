// src/workerInterpreter.ts

import { Lexer, TokenType, type Token } from './lexer.js';
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral, Line, WhileStatement } from './ast.js';

/**
 * メモリ空間クラス
 * VTLオリジナルに準拠した配列とスタックの統合メモリ空間を提供します。
 * 
 * 仕様:
 * - 共有メモリ空間: 65536要素（0-65535）
 * - スタックは上位アドレスから下に向かって伸びる（65535から開始）
 * - 配列とスタックは別々のメソッドでアクセス
 */
class MemorySpace {
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

/**
 * インタプリタの実行状態を保持するインターフェース。
 * Generator Function内で状態を管理するために使用されます。
 */
interface InterpreterState {
    programCounter: number; // 現在の実行行/ステートメントのインデックス
    variables: Map<string, number>; // ユーザー変数 (A-Z)
    systemVariables: Map<string, number>; // システム変数 (%, X, Yなど)
    callStack: number[]; // GOSUBのリターンアドレススタック
    // ... その他、インタプリタが必要とする状態
}

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
 * WorkerScriptインタプリタのコアクラス。
 * スクリプトのロード、解析、および1ステートメントごとの実行を制御します。
 */
class WorkerInterpreter {
    private scriptLines: string[] = []; // 解析済みのスクリプト行
    private labels: Map<string, number> = new Map(); // ラベル名と行番号のマッピング
    private tokens: Token[][] = []; // 各行のトークンリストを保持
    private program: Program | null = null; // 構築されたプログラムAST
    private lexer: Lexer; // Lexerのインスタンス
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
        this.scriptLines = script.split('\n');
        this.labels.clear(); // 既存のラベルをクリア
        this.tokens = []; // トークンリストをクリア

        this.scriptLines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith(':')) {
                // コメント行は単一のコメントトークンとして扱う
                this.tokens.push([{ type: TokenType.COMMENT, value: trimmedLine, line: index, column: 0 }]);
                return;
            }
            if (trimmedLine === '') {
                // 空行は空のトークンリストとして扱う
                this.tokens.push([]);
                return;
            }

            // ラベル定義の処理
            if (trimmedLine.startsWith('^')) {
                const labelName = trimmedLine.split(/\s/)[0]; // スペースまでをラベル名とする
                if (!labelName) {
                    throw new Error(`構文エラー: 無効なラベル定義 (行: ${index + 1})`);
                }
                // ラベル名から ^ を除去して保存
                const cleanLabelName = labelName.substring(1);
                if (this.labels.has(cleanLabelName)) {
                    throw new Error(`構文エラー: ラベル '${labelName}' が重複して定義されています。`);
                }
                this.labels.set(cleanLabelName, index);
                
                // 仕様: ラベルは行の先頭に記述され、その後に改行が続く
                // ラベル定義行は空のトークンリストとして扱う
                this.tokens.push([]);
                return;
            }

            // その他の行の字句解析
            try {
                this.tokens.push(this.lexer.tokenizeLine(trimmedLine, index));
            } catch (error: any) {
                throw new Error(`字句解析エラー (行: ${index + 1}): ${error.message}`);
            }
        });

        // 全行のASTを構築
        this.buildProgramAST();
    }

    /**
     * 全行のトークンからProgramASTを構築します。
     */
    private buildProgramAST(): void {
        const lines: Line[] = [];

        for (let i = 0; i < this.tokens.length; i++) {
            const lineTokens = this.tokens[i];
            if (!lineTokens) continue;

            // コメント行、空行の処理
            const emptyLine = this.tryProcessEmptyOrCommentLine(i, lineTokens);
            if (emptyLine) {
                lines.push(emptyLine);
                continue;
            }

            // 通常の行をパース
            try {
                const result = this.processNormalLine(i);
                if (result) {
                    lines.push(result.line);
                    i = result.endLine;
                }
            } catch (error: any) {
                throw new Error(`構文解析エラー (行: ${i + 1}): ${error.message}`);
            }
        }

        this.program = {
            type: 'Program',
            line: 0,
            body: lines,
        };
    }

    /**
     * コメント行または空行の処理を試行します。
     */
    private tryProcessEmptyOrCommentLine(lineNumber: number, lineTokens: Token[]): Line | null {
        // コメント行、空行、ラベル定義行はステートメントなしの行として扱う
        if (lineTokens.length === 0 || 
            (lineTokens.length === 1 && lineTokens[0]?.type === TokenType.COMMENT)) {
            const line: Line = {
                lineNumber: lineNumber,
                statements: [],
            };
            const sourceText = this.scriptLines[lineNumber];
            if (sourceText !== undefined) {
                line.sourceText = sourceText;
            }
            return line;
        }
        return null;
    }

    /**
     * 通常の行（ステートメントを含む行）を処理します。
     * ブロック構造の検出も含みます。
     */
    private processNormalLine(lineNumber: number): { line: Line; endLine: number } | null {
        const sourceText = this.scriptLines[lineNumber];
        if (!sourceText) return null;

        // 行を空白で分割してから各ステートメントをパース
        const stmtStrings = this.splitLineByWhitespace(sourceText);
        const parsedStatements: Statement[] = [];
        
        for (const stmtString of stmtStrings) {
            const stmt = this.parseStatementString(stmtString, lineNumber);
            if (stmt) {
                parsedStatements.push(stmt);
            }
        }
        
        // ブロック構造を試行
        const ifBlock = this.tryProcessIfBlock(parsedStatements, sourceText, lineNumber);
        if (ifBlock) {
            return ifBlock;
        }
        
        const forBlock = this.tryProcessForBlock(parsedStatements, sourceText, lineNumber);
        if (forBlock) {
            return forBlock;
        }
        
        const whileBlock = this.tryProcessWhileBlock(parsedStatements, sourceText, lineNumber);
        if (whileBlock) {
            return whileBlock;
        }
        
        // ブロック構造でなければ通常の行として返す
        const line: Line = {
            lineNumber: lineNumber,
            statements: parsedStatements,
            sourceText: sourceText,
        };
        return { line, endLine: lineNumber };
    }

    /**
     * パースされたステートメントがブロックIF構造かどうかを判定し、
     * ブロックIFの場合はそれを処理してLineを返します。
     * ブロックIFでない場合はnullを返します。
     */
    private tryProcessIfBlock(
        parsedStatements: Statement[],
        sourceText: string,
        lineNumber: number
    ): { line: Line; endLine: number } | null {
        // ブロックIF検出: 1行に1つだけIfStatementがある場合
        if (parsedStatements.length === 1 && parsedStatements[0]?.type === 'IfStatement') {
            const inlineIf = parsedStatements[0] as any;
            
            // IfBlockStatementに変換
            const blockIf: any = {
                type: 'IfBlockStatement',
                line: lineNumber,
                condition: inlineIf.condition,
                thenBody: [],
                elseBody: undefined,
            };
            
            // #=; まで本体を収集
            const endLine = this.collectIfBlock(blockIf, lineNumber + 1);
            
            // ブロック全体を1つのステートメントとして追加
            const line: Line = {
                lineNumber: lineNumber,
                statements: [blockIf],
                sourceText: sourceText,
            };
            
            return { line, endLine };
        }
        
        return null;
    }

    /**
     * パースされたステートメントがブロックFORループかどうかを判定し、
     * ブロックFORの場合はそれを処理してLineを返します。
     * ブロックFORでない場合はnullを返します。
     */
    private tryProcessForBlock(
        parsedStatements: Statement[],
        sourceText: string,
        lineNumber: number
    ): { line: Line; endLine: number } | null {
        // ブロックFORループ検出: 1行に1つだけForStatementがある場合
        if (parsedStatements.length === 1 && parsedStatements[0]?.type === 'ForStatement') {
            const inlineFor = parsedStatements[0] as any;
            
            // ForBlockStatementに変換
            const blockFor: any = {
                type: 'ForBlockStatement',
                line: lineNumber,
                variable: inlineFor.variable,
                start: inlineFor.start,
                end: inlineFor.end,
                step: inlineFor.step,
                body: [],
            };
            
            // #=@ まで本体を収集
            const { body, endLine } = this.collectLoopBlock(lineNumber + 1);
            blockFor.body = body;
            
            // ブロック全体を1つのステートメントとして追加
            const line: Line = {
                lineNumber: lineNumber,
                statements: [blockFor],
                sourceText: sourceText,
            };
            
            return { line, endLine };
        }
        
        return null;
    }

    /**
     * パースされたステートメントがブロックWHILEループかどうかを判定し、
     * ブロックWHILEの場合はそれを処理してLineを返します。
     * ブロックWHILEでない場合はnullを返します。
     */
    private tryProcessWhileBlock(
        parsedStatements: Statement[],
        sourceText: string,
        lineNumber: number
    ): { line: Line; endLine: number } | null {
        // ブロックWHILEループ検出: 1行に1つだけWhileStatementがある場合
        if (parsedStatements.length === 1 && parsedStatements[0]?.type === 'WhileStatement') {
            const inlineWhile = parsedStatements[0] as any;
            
            // WhileBlockStatementに変換
            const blockWhile: any = {
                type: 'WhileBlockStatement',
                line: lineNumber,
                condition: inlineWhile.condition,
                body: [],
            };
            
            // #=@ まで本体を収集
            const { body, endLine } = this.collectLoopBlock(lineNumber + 1);
            blockWhile.body = body;
            
            // ブロック全体を1つのステートメントとして追加
            const line: Line = {
                lineNumber: lineNumber,
                statements: [blockWhile],
                sourceText: sourceText,
            };
            
            return { line, endLine };
        }
        
        return null;
    }

    /**
     * 指定された行が #=; (EndIf) かどうかを判定します。
     */
    private isEndIfStatement(sourceText: string): boolean {
        return sourceText.trim() === '#=;';
    }

    /**
     * 指定された行が ; (Else) かどうかを判定します。
     */
    private isElseStatement(sourceText: string): boolean {
        return sourceText.trim() === ';';
    }

    /**
     * ブロックIF構造の本体を収集します。
     * ;=<condition> から #=; までの間のステートメントを再帰的にパースします。
     * ELSE (;) があればthenBodyとelseBodyに分けます。
     * ネストされたループやIF文も正しく処理します。
     * 
     * @param blockStmt IfBlockStatementノード（condition設定済み）
     * @param startLine ;=<condition> の次の行番号
     * @returns 処理した最終行番号（#=; の行）
     */
    private collectIfBlock(blockStmt: any, startLine: number): number {
        const thenBody: Statement[] = [];
        const elseBody: Statement[] = [];
        let currentBody = thenBody;
        let foundEndIf = false;

        for (let i = startLine; i < this.scriptLines.length; i++) {
            const sourceText = this.scriptLines[i];
            if (!sourceText) continue;

            // #=; を見つけたら終了
            if (this.isEndIfStatement(sourceText)) {
                foundEndIf = true;
                // thenBodyとelseBody（あれば）を設定してから終了
                blockStmt.thenBody = thenBody;
                if (elseBody.length > 0) {
                    blockStmt.elseBody = elseBody;
                }
                return i;
            }

            // ; を見つけたらelseBodyに切り替え
            if (this.isElseStatement(sourceText)) {
                currentBody = elseBody;
                continue;
            }

            // 行をステートメント文字列に分割
            const stmtStrings = this.splitLineByWhitespace(sourceText);
            const parsedStatements: Statement[] = [];
            
            // 各ステートメント文字列を基本パース
            for (const stmtString of stmtStrings) {
                const stmt = this.parseStatementString(stmtString, i);
                if (stmt) {
                    parsedStatements.push(stmt);
                }
            }
            
            // ブロック構造を検出（ForStatement/WhileStatement/IfStatementが単独の場合）
            if (parsedStatements.length === 1) {
                const stmt = parsedStatements[0];
                
                if (stmt?.type === 'ForStatement') {
                    // 内側のFORループを再帰的にパース
                    const innerBody = this.collectLoopBlock(i + 1);
                    const forBlockStmt: any = {
                        type: 'ForBlockStatement',
                        line: i,
                        variable: (stmt as any).variable,
                        start: (stmt as any).start,
                        end: (stmt as any).end,
                        step: (stmt as any).step,
                        body: innerBody.body,
                    };
                    currentBody.push(forBlockStmt);
                    // 内側ループの終端（#=@）までスキップ
                    i = innerBody.endLine;
                    continue;
                }
                
                if (stmt?.type === 'WhileStatement') {
                    // 内側のWHILEループを再帰的にパース
                    const innerBody = this.collectLoopBlock(i + 1);
                    const whileBlockStmt: any = {
                        type: 'WhileBlockStatement',
                        line: i,
                        condition: (stmt as any).condition,
                        body: innerBody.body,
                    };
                    currentBody.push(whileBlockStmt);
                    // 内側ループの終端（#=@）までスキップ
                    i = innerBody.endLine;
                    continue;
                }
                
                if (stmt?.type === 'IfStatement') {
                    // 内側のブロックIFを再帰的にパース
                    const ifBlockStmt: any = {
                        type: 'IfBlockStatement',
                        line: i,
                        condition: (stmt as any).condition,
                        thenBody: [],
                        elseBody: [],
                    };
                    const endLine = this.collectIfBlock(ifBlockStmt, i + 1);
                    currentBody.push(ifBlockStmt);
                    // 内側IFの終端（#=;）までスキップ
                    i = endLine;
                    continue;
                }
            }
            
            // 通常のステートメントを追加
            for (const stmt of parsedStatements) {
                currentBody.push(stmt);
            }
        }

        if (!foundEndIf) {
            throw new Error(`ブロックIF構造が #=; で終了していません (開始行: ${startLine})`);
        }

        return -1; // 到達しない
    }

    /**
     * 指定された行が #=@ (ループ終端) かどうかを判定します。
     */
    private isLoopEndStatement(sourceText: string): boolean {
        return sourceText.trim() === '#=@';
    }

    /**
     * ループブロック構造の本体を収集します。
     * @=... から #=@ までの間のステートメントを再帰的にパースします。
     * ネストされたループも正しく処理します。
     * 
     * @param startLine @=... の次の行番号
     * @returns ループ本体のステートメント配列と終了行番号
     */
    private collectLoopBlock(startLine: number): { body: Statement[]; endLine: number } {
        const body: Statement[] = [];

        for (let i = startLine; i < this.scriptLines.length; i++) {
            const sourceText = this.scriptLines[i];
            if (!sourceText) continue;

            // #=@ を見つけたら、このループの終端
            if (this.isLoopEndStatement(sourceText)) {
                return { body, endLine: i };
            }

            // 行をステートメント文字列に分割
            const stmtStrings = this.splitLineByWhitespace(sourceText);
            const parsedStatements: Statement[] = [];
            
            // 各ステートメント文字列を基本パース
            for (const stmtString of stmtStrings) {
                const stmt = this.parseStatementString(stmtString, i);
                if (stmt) {
                    parsedStatements.push(stmt);
                }
            }
            
            // ブロック構造を検出（ForStatement/WhileStatementが単独の場合）
            if (parsedStatements.length === 1) {
                const stmt = parsedStatements[0];
                
                if (stmt?.type === 'ForStatement') {
                    // 内側のFORループを再帰的にパース
                    const innerBody = this.collectLoopBlock(i + 1);
                    const forBlockStmt: any = {
                        type: 'ForBlockStatement',
                        line: i,
                        variable: (stmt as any).variable,
                        start: (stmt as any).start,
                        end: (stmt as any).end,
                        step: (stmt as any).step,
                        body: innerBody.body,
                    };
                    body.push(forBlockStmt);
                    // 内側ループの終端（#=@）までスキップ
                    i = innerBody.endLine;
                    continue;
                }
                
                if (stmt?.type === 'WhileStatement') {
                    // 内側のWHILEループを再帰的にパース
                    const innerBody = this.collectLoopBlock(i + 1);
                    const whileBlockStmt: any = {
                        type: 'WhileBlockStatement',
                        line: i,
                        condition: (stmt as any).condition,
                        body: innerBody.body,
                    };
                    body.push(whileBlockStmt);
                    // 内側ループの終端（#=@）までスキップ
                    i = innerBody.endLine;
                    continue;
                }
            }
            
            // 通常のステートメントを追加
            for (const stmt of parsedStatements) {
                body.push(stmt);
            }
        }

        // #=@ が見つからずにスクリプト終端に到達
        throw new Error(`ループ構造が #=@ で終了していません (開始行: ${startLine})`);
    }

    /**
     * トークンのリストからASTを構築します（テスト用の互換性メソッド）。
     * 
     * @internal このメソッドはPhase 2のテスト互換性のために残されています。
     * 本番コードでは使用されず、loadScript()内で自動的にparseStatementString()が呼ばれます。
     * 
     * @deprecated Phase 3完了後、テストをloadScript()ベースに書き換えて削除予定。
     * 
     * 【テスト改善計画 - 2025/10/18】
     * - 現在約40箇所のparse()呼び出しがテストで使用されている
     * - すべてパース専用テストで、実行テストは既にloadScript()方式
     * - 実証済み: loadScript() + getProgram() 方式への変換は技術的に可能
     * - 効果: テストと実行で同じコードパス使用、二重実装解消、より現実的なテスト
     * - 変更例: interpreter.parse(tokens) → interpreter.loadScript('A=10'); ast = interpreter.getProgram()
     * 
     * 中長期的には以下のように書き換えを推奨：
     * ```
     * // 現在: const ast = interpreter.parse(lexer.tokenizeLine(...));
     * // 将来: interpreter.loadScript("A=10 B=20"); const ast = interpreter.getProgram();
     * ```
     * 
     * @param tokens トークンの配列
     * @returns Program ASTノード
     */
    parse(tokens: Token[]): Program {
        const stmts: Statement[] = [];
        let i = 0;
        
        while (i < tokens.length) {
            const result = this.parseStatementFromTokens(tokens, i);
            if (result.statement) {
                stmts.push(result.statement);
            }
            i = result.nextIndex;
        }
        
        const programLine = tokens[0]?.line ?? 0;
        return {
            type: 'Program',
            line: programLine,
            body: [{
                lineNumber: programLine,
                statements: stmts,
            }],
        };
    }

    /**
     * トークン列から単一のステートメントをパースします。
     * 
     * parse()メソッドの実装を支えるヘルパーメソッド。
     * parse()削除時にこのメソッドも削除予定。
     * 
     * @param tokens トークン配列
     * @param startIndex 開始位置
     * @returns パースされたStatementと次のインデックス
     */
    private parseStatementFromTokens(tokens: Token[], startIndex: number): { statement: Statement | null; nextIndex: number } {
        const token = tokens[startIndex];
        
        if (!token) {
            return { statement: null, nextIndex: startIndex + 1 };
        }

        // 改行ステートメント (/)
        if (token.type === TokenType.SLASH) {
            return this.parseNewlineStatement(tokens, startIndex);
        }

        // 旧 RETURNステートメント (]) - 削除予定
        // 新仕様では #=! を使用

        const secondToken = tokens[startIndex + 1];
        if (!secondToken || secondToken.type !== TokenType.EQUALS) {
            throw new Error(`構文エラー: 予期しないトークン "${token.value}"`);
        }

        // GOTOステートメント (#=^LABEL) と HALTステートメント (#=-1)
        if (token.type === TokenType.HASH) {
            const thirdToken = tokens[startIndex + 2];
            
            if (!thirdToken) {
                throw new Error(`GOTO/HALTステートメントが不完全です`);
            }

            // #=-1 の場合はHALTステートメント
            if (thirdToken.type === TokenType.MINUS) {
                const fourthToken = tokens[startIndex + 3];
                if (fourthToken && fourthToken.type === TokenType.NUMBER && fourthToken.value === '1') {
                    return {
                        statement: {
                            type: 'HaltStatement',
                            line: token.line,
                            column: token.column,
                        },
                        nextIndex: startIndex + 4
                    };
                }
            }

            // #=! パターン（新 RETURN文）
            if (thirdToken.type === TokenType.BANG) {
                return {
                    statement: {
                        type: 'ReturnStatement',
                        line: token.line,
                        column: token.column,
                    },
                    nextIndex: startIndex + 3
                };
            }

            // #=@ パターン（NEXT文）- 統一構造
            if (thirdToken.type === TokenType.AT) {
                return {
                    statement: {
                        type: 'NextStatement',
                        line: token.line,
                        column: token.column,
                        // variable: undefined, // #=@は変数指定なし（統一構造）
                    },
                    nextIndex: startIndex + 3
                };
            }

            // #=^LABEL パターン（通常のGOTO）
            if (thirdToken.type === TokenType.LABEL_DEFINITION) {
                const labelName = thirdToken.value.substring(1);
                return {
                    statement: {
                        type: 'GotoStatement',
                        line: token.line,
                        column: token.column,
                        target: labelName,
                    },
                    nextIndex: startIndex + 3
                };
            }

            throw new Error(`構文エラー: GOTOにはラベル（^LABEL形式）が必要です`);
        }

        // GOSUBステートメント (!=^LABEL)
        if (token.type === TokenType.BANG) {
            const thirdToken = tokens[startIndex + 2];
            
            if (!thirdToken || thirdToken.type !== TokenType.LABEL_DEFINITION) {
                throw new Error(`構文エラー: GOSUBにはラベル（^LABEL形式）が必要です`);
            }

            const labelName = thirdToken.value.substring(1);
            return {
                statement: {
                    type: 'GosubStatement',
                    line: token.line,
                    column: token.column,
                    target: labelName,
                },
                nextIndex: startIndex + 3
            };
        }

        // IFステートメント (;=)
        if (token.type === TokenType.SEMICOLON) {
            const exprTokens = tokens.slice(startIndex + 2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                statement: {
                    type: 'IfStatement',
                    line: token.line,
                    column: token.column,
                    condition: exprResult.expr,
                },
                nextIndex: startIndex + 2 + exprResult.consumed
            };
        }

        // 出力ステートメント (?=)
        if (token.type === TokenType.QUESTION) {
            const exprTokens = tokens.slice(startIndex + 2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                statement: {
                    type: 'OutputStatement',
                    line: token.line,
                    column: token.column,
                    expression: exprResult.expr,
                },
                nextIndex: startIndex + 2 + exprResult.consumed
            };
        }

        // @ で始まるステートメント (@=I など)
        if (token.type === TokenType.AT) {
            return this.parseAtStatement(tokens, startIndex);
        }

        // POKEステートメント (`=expression)
        if (token.type === TokenType.BACKTICK) {
            const exprTokens = tokens.slice(startIndex + 2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                statement: {
                    type: 'PokeStatement',
                    line: token.line,
                    column: token.column,
                    value: exprResult.expr,
                },
                nextIndex: startIndex + 2 + exprResult.consumed
            };
        }

        // 1byte出力ステートメント ($=expression)
        if (token.type === TokenType.DOLLAR) {
            const exprTokens = tokens.slice(startIndex + 2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                statement: {
                    type: 'IoPutStatement',
                    line: token.line,
                    column: token.column,
                    value: exprResult.expr,
                },
                nextIndex: startIndex + 2 + exprResult.consumed
            };
        }

        // 変数名で始まるステートメント (代入または FORループ)
        if (token.type === TokenType.IDENTIFIER) {
            return this.parseIdentifierStatement(tokens, startIndex);
        }

        // 配列代入・初期化ステートメント ([expression]=...)
        if (token.type === TokenType.LEFT_BRACKET) {
            const statement = this.parseArrayStatement(tokens, startIndex);
            // nextIndexの計算: 全トークンを消費したと仮定
            return { statement, nextIndex: tokens.length };
        }

        throw new Error(`構文エラー: 未知のステートメント形式: ${token.value}`);
    }

    /**
     * 改行ステートメント (/) を解析します
     */
    private parseNewlineStatement(tokens: Token[], startIndex: number): { statement: Statement; nextIndex: number } {
        const token = tokens[startIndex]!;
        return {
            statement: {
                type: 'NewlineStatement',
                line: token.line,
                column: token.column,
            },
            nextIndex: startIndex + 1
        };
    }

    /**
     * @ で始まるステートメント (@=I など) を解析します
     * 現在: NEXTステートメントのみ
     * 将来: FOR/WHILE/NEXT の統一処理
     */
    private parseAtStatement(tokens: Token[], startIndex: number): { statement: Statement; nextIndex: number } {
        const token = tokens[startIndex]!;
        const secondToken = tokens[startIndex + 1];
        
        if (!secondToken || secondToken.type !== TokenType.EQUALS) {
            throw new Error(`構文エラー: @ の後に = が必要です`);
        }

        const thirdToken = tokens[startIndex + 2];
        
        // @=(condition) - WHILEループ
        if (thirdToken && thirdToken.type === TokenType.LEFT_PAREN) {
            // 括弧内の式を解析
            const exprTokens = tokens.slice(startIndex + 3);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            // 終了括弧を確認
            const rparenToken = tokens[startIndex + 3 + exprResult.consumed];
            if (!rparenToken || rparenToken.type !== TokenType.RIGHT_PAREN) {
                throw new Error(`構文エラー: WHILEループの条件式を閉じる ) が必要です`);
            }
            
            return {
                statement: {
                    type: 'WhileStatement',
                    line: token.line,
                    column: token.column,
                    condition: exprResult.expr,
                },
                nextIndex: startIndex + 4 + exprResult.consumed
            };
        }
        
        // @=I (NEXTステートメントまたはFORループ)
        if (thirdToken && thirdToken.type === TokenType.IDENTIFIER) {
            const fourthToken = tokens[startIndex + 3];
            
            // @=I,1,100 の場合は新しいFORループ構文
            if (fourthToken && fourthToken.type === TokenType.COMMA) {
                const exprTokens = tokens.slice(startIndex + 4);
                const exprResult = this.parseExpressionFromTokens(exprTokens);
                
                if (this.isCommaExpression(exprResult.expr)) {
                    const parts = this.extractCommaExpressionParts(exprResult.expr);
                    
                    if (parts.length === 2) {
                        return {
                            statement: {
                                type: 'ForStatement',
                                line: token.line,
                                column: token.column,
                                variable: {
                                    type: 'Identifier',
                                    name: thirdToken.value,
                                    line: thirdToken.line,
                                    column: thirdToken.column,
                                },
                                start: parts[0]!,
                                end: parts[1]!,
                                // stepは省略（デフォルト1）
                            },
                            nextIndex: startIndex + 4 + exprResult.consumed
                        };
                    } else if (parts.length === 3) {
                        return {
                            statement: {
                                type: 'ForStatement',
                                line: token.line,
                                column: token.column,
                                variable: {
                                    type: 'Identifier',
                                    name: thirdToken.value,
                                    line: thirdToken.line,
                                    column: thirdToken.column,
                                },
                                start: parts[0]!,
                                end: parts[1]!,
                                step: parts[2]!,
                            },
                            nextIndex: startIndex + 4 + exprResult.consumed
                        };
                    } else {
                        throw new Error(`構文エラー: FORループの形式が不正です (@=${thirdToken.value},start,end[,step])`);
                    }
                } else {
                    // @=I,expr (単一式) -> start,end形式
                    return {
                        statement: {
                            type: 'ForStatement',
                            line: token.line,
                            column: token.column,
                            variable: {
                                type: 'Identifier',
                                name: thirdToken.value,
                                line: thirdToken.line,
                                column: thirdToken.column,
                            },
                            start: exprResult.expr,
                            end: exprResult.expr,
                            // stepは省略（デフォルト1）
                        },
                        nextIndex: startIndex + 4 + exprResult.consumed
                    };
                }
            }
        }
        
        throw new Error(`構文エラー: @ で始まるステートメントは @=変数,開始,終了[,ステップ] の形式である必要があります`);
    }

    /**
     * 変数名で始まるステートメント (代入または FORループ) を解析します
     * 現在: FOR判定 + 代入判定
     * 将来: 代入のみ（FOR判定は parseAtStatement に移行）
     */
    private parseIdentifierStatement(tokens: Token[], startIndex: number): { statement: Statement; nextIndex: number } {
        const token = tokens[startIndex]!;
        const exprTokens = tokens.slice(startIndex + 2);
        const exprResult = this.parseExpressionFromTokens(exprTokens);

        // 代入文専用メソッド（FORループは@=構文で処理）
        return {
            statement: {
                type: 'AssignmentStatement',
                line: token.line,
                column: token.column,
                variable: {
                    type: 'Identifier',
                    name: token.value,
                    line: token.line,
                    column: token.column,
                },
                value: exprResult.expr,
            },
            nextIndex: startIndex + 2 + exprResult.consumed
        };
    }

    /**
     * # で始まるステートメント (#=...) を解析します
     * GOTO (#=^LABEL), HALT (#=-1), RETURN (#=!), NEXT (#=@) を処理
     */
    private parseHashStatement(tokens: Token[], startIndex: number): Statement {
        const firstToken = tokens[startIndex]!;
        const secondToken = tokens[startIndex + 1];
        
        if (!secondToken || secondToken.type !== TokenType.EQUALS) {
            throw new Error(`構文エラー: # の後に = が必要です`);
        }

        const thirdToken = tokens[startIndex + 2];
        
        if (!thirdToken) {
            throw new Error(`GOTO/HALTステートメントが不完全です`);
        }

        // #=-1 の場合はHALTステートメント
        if (thirdToken.type === TokenType.MINUS) {
            const fourthToken = tokens[startIndex + 3];
            if (fourthToken && fourthToken.type === TokenType.NUMBER && fourthToken.value === '1') {
                return {
                    type: 'HaltStatement',
                    line: firstToken.line,
                    column: firstToken.column,
                };
            }
        }

        // #=! パターン（新 RETURN文）
        if (thirdToken.type === TokenType.BANG) {
            return {
                type: 'ReturnStatement',
                line: firstToken.line,
                column: firstToken.column,
            };
        }

        // #=@ パターン（NEXT文）- 統一構造
        if (thirdToken.type === TokenType.AT) {
            return {
                type: 'NextStatement',
                line: firstToken.line,
                column: firstToken.column,
            };
        }

        // #=^LABEL パターン（通常のGOTO）
        if (thirdToken.type === TokenType.LABEL_DEFINITION) {
            const labelName = thirdToken.value.substring(1); // ^ を除去
            return {
                type: 'GotoStatement',
                line: firstToken.line,
                column: firstToken.column,
                target: labelName,
            };
        }

        throw new Error(`構文エラー: GOTOにはラベル（^LABEL形式）が必要です`);
    }

    /**
     * [ で始まるステートメント ([expression]=...) を解析します
     * 配列代入 ([A]=100) と配列初期化 ([A]=1,2,3) を処理
     */
    private parseArrayStatement(tokens: Token[], startIndex: number): Statement {
        const firstToken = tokens[startIndex]!;
        
        if (firstToken.type !== TokenType.LEFT_BRACKET) {
            throw new Error(`構文エラー: 配列ステートメントは [ で始まる必要があります`);
        }

        // 対応する ] を見つける
        let depth = 1;
        let endIndex = startIndex + 1;
        while (endIndex < tokens.length && depth > 0) {
            if (tokens[endIndex]?.type === TokenType.LEFT_BRACKET) {
                depth++;
            } else if (tokens[endIndex]?.type === TokenType.RIGHT_BRACKET) {
                depth--;
            }
            if (depth > 0) {
                endIndex++;
            }
        }

        if (depth !== 0) {
            throw new Error(`構文エラー: 配列括弧が閉じられていません (行: ${firstToken.line + 1})`);
        }

        // インデックス式を解析
        const indexTokens = tokens.slice(startIndex + 1, endIndex);
        if (indexTokens.length === 0) {
            throw new Error(`構文エラー: 配列インデックスが空です (行: ${firstToken.line + 1})`);
        }

        const indexExpr = this.parseBinaryExpression(indexTokens, 0);

        // リテラル[-1]の検出
        const isLiteral = 
            indexTokens.length === 2 &&
            indexTokens[0]!.type === TokenType.MINUS &&
            indexTokens[1]!.type === TokenType.NUMBER &&
            indexTokens[1]!.value === '1';

        // = トークンを確認
        const equalsToken = tokens[endIndex + 1];
        if (!equalsToken || equalsToken.type !== TokenType.EQUALS) {
            throw new Error(`構文エラー: 配列ステートメントには = が必要です (行: ${firstToken.line + 1})`);
        }

        // 右辺のトークンを取得
        const valueTokens = tokens.slice(endIndex + 2);
        if (valueTokens.length === 0) {
            throw new Error(`構文エラー: 配列ステートメントの右辺が空です (行: ${firstToken.line + 1})`);
        }

        // カンマが含まれているか確認（配列初期化の判定）
        const hasComma = valueTokens.some(token => token.type === TokenType.COMMA);

        if (hasComma) {
            // 配列初期化: [A]=1,2,3
            const values: Expression[] = [];
            let currentTokens: Token[] = [];

            for (const token of valueTokens) {
                if (token.type === TokenType.COMMA) {
                    if (currentTokens.length > 0) {
                        const valueExpr = this.parseBinaryExpression(currentTokens, 0);
                        values.push(valueExpr.expr);
                        currentTokens = [];
                    }
                } else {
                    currentTokens.push(token);
                }
            }

            // 最後の値を追加
            if (currentTokens.length > 0) {
                const valueExpr = this.parseBinaryExpression(currentTokens, 0);
                values.push(valueExpr.expr);
            }

            // 配列初期化ではスタック操作は不可（リテラル[-1]は無効）
            if (isLiteral) {
                throw new Error(`構文エラー: 配列初期化でスタックアクセス[-1]は使用できません (行: ${firstToken.line + 1})`);
            }

            return {
                type: 'ArrayInitializationStatement',
                line: firstToken.line,
                column: firstToken.column,
                index: indexExpr.expr,
                values,
            };
        } else {
            // 配列代入: [A]=100
            const valueExpr = this.parseBinaryExpression(valueTokens, 0);

            return {
                type: 'ArrayAssignmentStatement',
                line: firstToken.line,
                column: firstToken.column,
                index: indexExpr.expr,
                value: valueExpr.expr,
                isLiteral,
            };
        }
    }

    /**
     * 式を解析します（現時点では単純なリテラルと識別子のみ）。
     * @param token 式のトークン
     * @returns Expression ASTノード
     */
    private parseExpression(token: Token): Expression {
        if (token.type === TokenType.NUMBER) {
            return {
                type: 'NumericLiteral',
                value: parseInt(token.value, 10),
                line: token.line,
                column: token.column,
            };
        }
        
        if (token.type === TokenType.STRING) {
            return {
                type: 'StringLiteral',
                value: token.value,
                line: token.line,
                column: token.column,
            };
        }
        
        if (token.type === TokenType.IDENTIFIER) {
            return {
                type: 'Identifier',
                name: token.value,
                line: token.line,
                column: token.column,
            };
        }

        if (token.type === TokenType.BACKTICK) {
            return {
                type: 'PeekExpression',
                line: token.line,
                column: token.column,
            };
        }

        if (token.type === TokenType.TILDE) {
            return {
                type: 'RandomExpression',
                line: token.line,
                column: token.column,
            };
        }

        if (token.type === TokenType.CHAR_LITERAL) {
            return {
                type: 'CharLiteralExpression',
                line: token.line,
                column: token.column,
                value: token.value,
            };
        }

        if (token.type === TokenType.DOLLAR) {
            return {
                type: 'IoGetExpression',
                line: token.line,
                column: token.column,
            };
        }

        throw new Error(`構文エラー: 無効な式トークン '${token.value}' (行: ${token.line + 1})`);
    }

    /**
     * トークンの配列から式を解析します（複数トークンの式をサポート）。
     * VTL系言語の仕様に従い、左から右へ評価します（括弧は優先順位を変更）。
     * @param tokens 式のトークン配列
     * @returns Expression ASTノードと消費したトークン数
     */
    private parseExpressionFromTokens(tokens: Token[]): { expr: Expression; consumed: number } {
        if (tokens.length === 0) {
            throw new Error('構文エラー: 式が空です');
        }

        // デバッグ: トークン列を出力
        // console.log('parseExpressionFromTokens:', tokens.map(t => `${t?.type}:${t?.value}`).join(', '));

        // 単一トークンの場合
        if (tokens.length === 1) {
            return { expr: this.parseExpression(tokens[0]!), consumed: 1 };
        }

        // 括弧がある場合の処理
        const result = this.parseBinaryExpression(tokens, 0);
        return { expr: result.expr, consumed: result.nextIndex };
    }

    /**
     * 演算子の優先順位を返します。
     * 数値が大きいほど優先順位が高い。
     * @param operator 演算子文字列
     * @returns 優先順位（1-6）
     */
    private getOperatorPrecedence(operator: string): number {
        // 優先順位（高→低）:
        // 6: 単項演算子 (!, -, +) - parsePrimaryExpressionで処理
        // 5: 乗除算・剰余 (*, /, %)
        // 4: 加減算 (+, -)
        // 3: 比較 (>, <, >=, <=, =, <>)
        // 2: 論理AND (&)
        // 1: 論理OR (|)
        
        switch (operator) {
            case '*':
            case '/':
            case '%':
                return 5;
            case '+':
            case '-':
                return 4;
            case '>':
            case '<':
            case '>=':
            case '<=':
            case '=':
            case '<>':
                return 3;
            case '&':
                return 2;
            case '|':
                return 1;
            default:
                return 0;
        }
    }

    /**
     * 二項演算式を優先順位を考慮して再帰的に解析します。
     * @param tokens トークン配列
     * @param start 開始インデックス
     * @param minPrecedence 最小優先順位
     * @returns 解析された式と次のインデックス
     */
    private parseBinaryExpression(tokens: Token[], start: number, minPrecedence: number = 0): { expr: Expression; nextIndex: number } {
        // 左辺を解析
        let left = this.parsePrimaryExpression(tokens, start);
        let index = left.nextIndex;

        // 演算子がある限り続ける
        while (index < tokens.length) {
            const token = tokens[index];
            if (!token) break;

            // 演算子かどうかチェック
            if (!this.isBinaryOperator(token.type)) {
                break;
            }

            const operator = token.value;
            const precedence = this.getOperatorPrecedence(operator);

            // 優先順位が低い場合は終了
            if (precedence < minPrecedence) {
                break;
            }

            index++;

            // 右辺を解析（同じ優先順位の場合は左結合のため +1）
            const right = this.parseBinaryExpression(tokens, index, precedence + 1);
            index = right.nextIndex;

            // 二項演算式を構築
            left.expr = {
                type: 'BinaryExpression',
                operator,
                left: left.expr,
                right: right.expr,
                line: left.expr.line,
            };
        }

        return { expr: left.expr, nextIndex: index };
    }

    /**
     * 基本式（リテラル、識別子、括弧式、単項演算）を解析します。
     * @param tokens トークン配列
     * @param start 開始インデックス
     * @returns 解析された式と次のインデックス
     */
    private parsePrimaryExpression(tokens: Token[], start: number): { expr: Expression; nextIndex: number } {
        const token = tokens[start];
        if (!token) {
            throw new Error('構文エラー: 式が不完全です');
        }

        // 単項マイナス演算子
        if (token.type === TokenType.MINUS) {
            // マイナスの後の式を解析
            const result = this.parsePrimaryExpression(tokens, start + 1);
            return {
                expr: {
                    type: 'UnaryExpression',
                    operator: '-',
                    operand: result.expr,
                    line: token.line,
                    column: token.column,
                },
                nextIndex: result.nextIndex,
            };
        }

        // 単項プラス演算子
        if (token.type === TokenType.PLUS) {
            const result = this.parsePrimaryExpression(tokens, start + 1);
            return {
                expr: {
                    type: 'UnaryExpression',
                    operator: '+',
                    operand: result.expr,
                    line: token.line,
                    column: token.column,
                },
                nextIndex: result.nextIndex,
            };
        }

        // NOT演算子 (!)
        if (token.type === TokenType.BANG) {
            const result = this.parsePrimaryExpression(tokens, start + 1);
            return {
                expr: {
                    type: 'UnaryExpression',
                    operator: '!',
                    operand: result.expr,
                    line: token.line,
                    column: token.column,
                },
                nextIndex: result.nextIndex,
            };
        }

        // 括弧式
        if (token.type === TokenType.LEFT_PAREN) {
            // 対応する閉じ括弧を見つける
            let depth = 1;
            let endIndex = start + 1;
            while (endIndex < tokens.length && depth > 0) {
                if (tokens[endIndex]?.type === TokenType.LEFT_PAREN) {
                    depth++;
                } else if (tokens[endIndex]?.type === TokenType.RIGHT_PAREN) {
                    depth--;
                }
                if (depth > 0) {
                    endIndex++;
                }
            }

            if (depth !== 0) {
                throw new Error(`構文エラー: 括弧が閉じられていません (行: ${token.line + 1})`);
            }

            // 括弧内の式を再帰的に解析
            const innerTokens = tokens.slice(start + 1, endIndex);
            const innerExpr = this.parseBinaryExpression(innerTokens, 0);

            return { expr: innerExpr.expr, nextIndex: endIndex + 1 };
        }

        // 配列アクセス式 [expression]
        if (token.type === TokenType.LEFT_BRACKET) {
            // 対応する閉じ括弧を見つける
            let depth = 1;
            let endIndex = start + 1;
            while (endIndex < tokens.length && depth > 0) {
                if (tokens[endIndex]?.type === TokenType.LEFT_BRACKET) {
                    depth++;
                } else if (tokens[endIndex]?.type === TokenType.RIGHT_BRACKET) {
                    depth--;
                }
                if (depth > 0) {
                    endIndex++;
                }
            }

            if (depth !== 0) {
                throw new Error(`構文エラー: 配列括弧が閉じられていません (行: ${token.line + 1})`);
            }

            // 括弧内の式を解析
            const innerTokens = tokens.slice(start + 1, endIndex);
            if (innerTokens.length === 0) {
                throw new Error(`構文エラー: 配列インデックスが空です (行: ${token.line + 1})`);
            }

            const innerExpr = this.parseBinaryExpression(innerTokens, 0);

            // リテラル[-1]の検出: 単一のマイナス数値リテラル
            const isLiteral = 
                innerTokens.length === 2 &&
                innerTokens[0]!.type === TokenType.MINUS &&
                innerTokens[1]!.type === TokenType.NUMBER &&
                innerTokens[1]!.value === '1';

            return {
                expr: {
                    type: 'ArrayAccessExpression',
                    index: innerExpr.expr,
                    isLiteral,
                    line: token.line,
                    column: token.column,
                },
                nextIndex: endIndex + 1,
            };
        }

        // 単純な値（数値、文字列、識別子）
        const expr = this.parseExpression(token);
        return { expr, nextIndex: start + 1 };
    }

    /**
     * トークンタイプが二項演算子かどうかを判定します。
     * @param tokenType トークンタイプ
     * @returns 二項演算子の場合true
     */
    private isBinaryOperator(tokenType: TokenType): boolean {
        return this.getBinaryOperatorTypes().includes(tokenType);
    }

    /**
     * トークンが式の一部として有効かどうかを判定します。
     * @param tokenType トークンタイプ
     * @returns 式トークンの場合true
     */
    private isExpressionToken(tokenType: TokenType): boolean {
        return [
            TokenType.NUMBER,
            TokenType.STRING,
            TokenType.IDENTIFIER,
            TokenType.LEFT_PAREN,
            TokenType.RIGHT_PAREN,
            TokenType.LEFT_BRACKET,
            TokenType.RIGHT_BRACKET,
            TokenType.BACKTICK,
            TokenType.TILDE,
            TokenType.CHAR_LITERAL,
            TokenType.DOLLAR,
            ...this.getBinaryOperatorTypes(),
        ].includes(tokenType);
    }

    /**
     * 二項演算子のトークンタイプ一覧を取得します。
     * @returns 二項演算子のトークンタイプ配列
     */
    private getBinaryOperatorTypes(): TokenType[] {
        return [
            TokenType.PLUS,
            TokenType.MINUS,
            TokenType.ASTERISK,
            TokenType.SLASH,
            TokenType.PERCENT,
            TokenType.EQUALS,
            TokenType.GREATER_THAN,
            TokenType.LESS_THAN,
            TokenType.GREATER_THAN_OR_EQUAL,
            TokenType.LESS_THAN_OR_EQUAL,
            TokenType.NOT_EQUAL,
            TokenType.AMPERSAND,
            TokenType.PIPE,
            TokenType.COMMA, // カンマ演算子（FORループ専用、最低優先度）
        ];
    }

    /**
     * 行を空白で分割し、文字列リテラル内の空白を保護します。
     * ダブルクォートの二重化 ("") もサポートします。
     * @param line 分割する行の文字列
     * @returns ステートメント文字列の配列
     */
    splitLineByWhitespace(line: string): string[] {
        const statements: string[] = [];
        let current = '';
        let inString = false;
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            
            // charがundefinedの場合は終了
            if (!char) {
                break;
            }

            // コメント開始チェック（文字列外のみ）
            if (!inString && char === ':') {
                // 現在のステートメントを保存
                if (current.length > 0) {
                    statements.push(current);
                }
                // 残りの部分をコメントとして追加
                statements.push(line.substring(i));
                break;
            }

            if (char === '"') {
                // ダブルクォートの処理
                if (inString) {
                    // 文字列内でダブルクォートを発見
                    if (line[i + 1] === '"') {
                        // "" はエスケープされたダブルクォート
                        current += '""';
                        i += 2;
                        continue;
                    } else {
                        // 文字列の終了
                        current += char;
                        inString = false;
                        i++;
                        continue;
                    }
                } else {
                    // 文字列の開始
                    current += char;
                    inString = true;
                    i++;
                    continue;
                }
            }

            if (char === "'" && !inString) {
                // シングルクォートの処理：'X' 形式の文字リテラルかチェック
                if (i + 2 < line.length && line[i + 2] === "'") {
                    // 文字リテラル 'X' を一括処理
                    current += line.substring(i, i + 3); // 'X' を追加
                    i += 3;
                    continue;
                } else {
                    // 不正な形式または未完了の文字リテラル
                    current += char;
                    i++;
                    continue;
                }
            }

            if (!inString && /\s/.test(char)) {
                // 文字列外の空白
                if (current.length > 0) {
                    statements.push(current);
                    current = '';
                }
                i++;
                continue;
            }

            // 通常の文字
            current += char;
            i++;
        }

        // 最後のステートメントを追加
        if (current.length > 0) {
            statements.push(current);
        }

        return statements;
    }

    /**
     * 単一のステートメント文字列をパースしてStatementに変換します。
     * @param stmtString ステートメント文字列（例: "A=10", "?=100", "/"）
     * @param lineNumber 行番号（エラーメッセージ用）
     * @returns Statement ASTノード、またはnull（空文字列の場合）
     */
    private parseStatementString(stmtString: string, lineNumber: number): Statement | null {
        if (stmtString.trim() === '') {
            return null;
        }

        // コメント文字列の直接チェック（破棄）
        if (stmtString.trim().startsWith(':')) {
            return null; // コメントは実行対象から除外
        }

        // ステートメント文字列をトークン化
        const tokens = this.lexer.tokenizeLine(stmtString, lineNumber);
        
        if (tokens.length === 0) {
            return null;
        }

        // 単一トークンのステートメント
        const firstToken = tokens[0];
        if (!firstToken) {
            return null;
        }

        // 改行ステートメント (/)
        if (firstToken.type === TokenType.SLASH && tokens.length === 1) {
            return {
                type: 'NewlineStatement',
                line: firstToken.line,
                column: firstToken.column,
            };
        }

        // 旧 RETURNステートメント (]) - 削除予定
        // 新仕様では #=! を使用

        // COMMENTは実行時に無視（ASTに含めない）
        if (firstToken.type === TokenType.COMMENT) {
            return null; // コメントは破棄
        }

        // 2トークン以上必要なステートメント
        const secondToken = tokens[1];
        if (!secondToken) {
            throw new Error(`不完全なステートメント: ${stmtString}`);
        }

        // #で始まるステートメント (GOTO/HALT/RETURN/NEXT)
        if (firstToken.type === TokenType.HASH && secondToken.type === TokenType.EQUALS) {
            return this.parseHashStatement(tokens, 0);
        }

        // GOSUBステートメント (!=^LABEL)
        if (firstToken.type === TokenType.BANG && secondToken.type === TokenType.EQUALS) {
            const thirdToken = tokens[2];
            
            if (!thirdToken) {
                throw new Error(`GOSUBステートメントが不完全です`);
            }

            if (thirdToken.type === TokenType.LABEL_DEFINITION) {
                const labelName = thirdToken.value.substring(1); // ^ を除去
                return {
                    type: 'GosubStatement',
                    line: firstToken.line,
                    column: firstToken.column,
                    target: labelName,
                };
            }

            throw new Error(`構文エラー: GOSUBにはラベル（^LABEL形式）が必要です`);
        }

        // IFステートメント (;=)
        if (firstToken.type === TokenType.SEMICOLON && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                type: 'IfStatement',
                line: firstToken.line,
                column: firstToken.column,
                condition: exprResult.expr,
            };
        }

        // 出力ステートメント (?=)
        if (firstToken.type === TokenType.QUESTION && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                type: 'OutputStatement',
                line: firstToken.line,
                column: firstToken.column,
                expression: exprResult.expr,
            };
        }

        // @で始まるステートメント (新しい統一処理)
        if (firstToken.type === TokenType.AT && secondToken.type === TokenType.EQUALS) {
            const result = this.parseAtStatement(tokens, 0);
            return result.statement;
        }

        // POKEステートメント (`=expression)
        if (firstToken.type === TokenType.BACKTICK && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                type: 'PokeStatement',
                line: firstToken.line,
                column: firstToken.column,
                value: exprResult.expr,
            };
        }

        // 1byte出力ステートメント ($=expression)
        if (firstToken.type === TokenType.DOLLAR && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                type: 'IoPutStatement',
                line: firstToken.line,
                column: firstToken.column,
                value: exprResult.expr,
            };
        }

        // 変数名で始まるステートメント (新しい統一処理)
        if (firstToken.type === TokenType.IDENTIFIER && secondToken.type === TokenType.EQUALS) {
            const result = this.parseIdentifierStatement(tokens, 0);
            return result.statement;
        }

        // 配列代入・初期化ステートメント ([expression]=...)
        if (firstToken.type === TokenType.LEFT_BRACKET) {
            return this.parseArrayStatement(tokens, 0);
        }

        throw new Error(`構文エラー: 未知のステートメント形式: ${stmtString}`);
    }

    /**
     * トークンがステートメントの開始を示すかどうかを判定します。
     * @param tokenType トークンタイプ
     * @returns ステートメント開始の場合true
     */
    // TODO: 必要に応じて、式評価、変数解決などのヘルパーメソッドを追加
    // private evaluateExpression(expression: string, state: InterpreterState): number | string { ... }
    // private getVariableValue(name: string, state: InterpreterState): number { ... }
    // private setVariableValue(name: string, value: number, state: InterpreterState): void { ... }

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

    /**
     * 単一のステートメントを実行します。
     * @param statement 実行するステートメント
     * @returns 実行結果（ジャンプ、停止、スキップの情報）
     */
    private executeStatement(statement: Statement): { jump: boolean; halt: boolean; skipRemaining: boolean } {
        switch (statement.type) {
            case 'AssignmentStatement':
                {
                    const value = this.evaluateExpression(statement.value);
                    if (typeof value === 'string') {
                        throw new Error('変数には数値のみを代入できます');
                    }
                    this.variables.set(statement.variable.name, value);
                }
                break;
            
            case 'OutputStatement':
                {
                    const value = this.evaluateExpression(statement.expression);
                    this.logFn(value);
                }
                break;
            
            case 'NewlineStatement':
                {
                    this.logFn('\n');
                }
                break;
            
            case 'IfStatement':
                {
                    const condition = this.evaluateExpression(statement.condition);
                    if (typeof condition === 'string') {
                        throw new Error('IF条件は数値でなければなりません');
                    }
                    // 条件が0（偽）の場合、この行の残りをスキップ
                    if (condition === 0) {
                        return { jump: false, halt: false, skipRemaining: true };
                    }
                }
                break;
            
            case 'IfBlockStatement':
                {
                    const condition = this.evaluateExpression((statement as any).condition);
                    if (typeof condition === 'string') {
                        throw new Error('IF条件は数値でなければなりません');
                    }
                    
                    // 条件が真（非0）の場合、thenBodyを実行
                    if (condition !== 0) {
                        for (const stmt of (statement as any).thenBody || []) {
                            const result = this.executeStatement(stmt);
                            if (result.jump || result.halt) {
                                return result;
                            }
                        }
                    } else {
                        // 条件が偽（0）の場合、elseBodyを実行
                        for (const stmt of (statement as any).elseBody || []) {
                            const result = this.executeStatement(stmt);
                            if (result.jump || result.halt) {
                                return result;
                            }
                        }
                    }
                }
                break;
            
            case 'ForBlockStatement':
                {
                    const forStmt = statement as any;
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
                        break;
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
                }
                break;
            
            case 'WhileBlockStatement':
                {
                    const whileStmt = statement as any;
                    
                    // 条件を評価
                    const condition = this.evaluateExpression(whileStmt.condition);
                    
                    // 型チェック
                    if (typeof condition === 'string') {
                        throw new Error('WHILEループの条件は数値でなければなりません');
                    }
                    
                    // 条件が偽ならループをスキップ
                    if (condition === 0) {
                        break;
                    }
                    
                    // ループ情報をスタックにpush（最初のステートメントは実行しない）
                    this.loopStack.push({
                        type: 'while',
                        condition: whileStmt.condition,
                        body: whileStmt.body,
                        bodyIndex: 0,
                    });
                    
                    // run()のloopStack処理に任せる
                }
                break;
            
            case 'GotoStatement':
                {
                    const targetLine = this.labels.get(statement.target);
                    if (targetLine === undefined) {
                        throw new Error(`ラベル ${statement.target} が見つかりません`);
                    }
                    this.currentLineIndex = targetLine;
                    return { jump: true, halt: false, skipRemaining: false };
                }
            
            case 'GosubStatement':
                {
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
            
            case 'ReturnStatement':
                {
                    if (this.callStack.length === 0) {
                        throw new Error('RETURN文がありますがGOSUBの呼び出しがありません');
                    }
                    const returnLine = this.callStack.pop()!;
                    // NOTE: 行ベースのリターン。GOSUB呼び出しがあった行の次の行に戻ります。
                    // 同じ行内の特定のステートメント位置には戻れません。
                    this.currentLineIndex = returnLine;
                    return { jump: true, halt: false, skipRemaining: false };
                }
            
            case 'HaltStatement':
                {
                    return { jump: false, halt: true, skipRemaining: false };
                }
            
            case 'PokeStatement': {
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
                break;
            }

            case 'IoPutStatement': {
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
                break;
            }

            case 'ArrayAssignmentStatement': {
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
                break;
            }

            case 'ArrayInitializationStatement': {
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
                break;
            }
        }
        return { jump: false, halt: false, skipRemaining: false };
    }


    /**
     * 式を評価して数値または文字列を返します。
     * @param expr 評価する式
     * @returns 評価結果の数値または文字列
     */
    private evaluateExpression(expr: Expression): number | string {
        switch (expr.type) {
            case 'NumericLiteral':
                return expr.value;
            
            case 'StringLiteral':
                return expr.value;
            
            case 'Identifier':
                {
                    const value = this.variables.get(expr.name);
                    if (value === undefined) {
                        // 未初期化の変数は0として扱う
                        return 0;
                    }
                    return value;
                }
            
            case 'UnaryExpression':
                {
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
            
            case 'BinaryExpression':
                {
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
            
            case 'PeekExpression':
                {
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
            
            case 'RandomExpression':
                {
                    // ランダム数生成: 0-32767の範囲
                    return Math.floor(Math.random() * 32768);
                }

            case 'CharLiteralExpression':
                {
                    // 文字リテラルをASCIIコードに変換
                    const charValue = expr.value;
                    if (charValue.length === 1) {
                        return charValue.charCodeAt(0);
                    } else {
                        // エスケープシーケンス等で処理済みの文字
                        return charValue.charCodeAt(0);
                    }
                }

            case 'IoGetExpression':
                {
                    // VTL互換 1byte入力: $システム変数から値を読み取り
                    if (this.getFn) {
                        const value = this.getFn();
                        // 0-255の範囲に制限
                        return Math.max(0, Math.min(255, Math.floor(value)));
                    } else {
                        throw new Error('1byte入力機能が設定されていません');
                    }
                }

            case 'ArrayAccessExpression':
                {
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
