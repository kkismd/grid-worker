// src/workerInterpreter.ts

import { Lexer, TokenType, type Token } from './lexer';
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral } from './ast';

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
    private tokens: Token[][] = []; // 各行のトークンリストを保持
    private lexer: Lexer; // Lexerのインスタンス
    private gridData: number[];
    private peekFn: (index: number) => number;
    private pokeFn: (index: number, value: number) => void;
    private logFn: (...args: any[]) => void;

    /**
     * WorkerInterpreterの新しいインスタンスを初期化します。
     * 外部APIやグリッドデータは依存性注入されます。
     * @param config 設定オブジェクト
     */
    constructor(config: {
        gridData: number[];
        peekFn: (index: number) => number;
        pokeFn: (index: number, value: number) => void;
        logFn: (...args: any[]) => void;
    }) {
        this.gridData = config.gridData;
        this.peekFn = config.peekFn;
        this.pokeFn = config.pokeFn;
        this.logFn = config.logFn;
        this.lexer = new Lexer(); // Lexerのインスタンスを初期化
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
                if (this.labels.has(labelName)) {
                    throw new Error(`構文エラー: ラベル '${labelName}' が重複して定義されています。`);
                }
                this.labels.set(labelName, index);
                this.tokens.push([{ type: TokenType.LABEL_DEFINITION, value: labelName, line: index, column: 0 }]);
                return;
            }

            // その他の行の字句解析
            try {
                this.tokens.push(this.lexer.tokenizeLine(trimmedLine, index));
            } catch (error: any) {
                throw new Error(`字句解析エラー (行: ${index + 1}): ${error.message}`);
            }
        });

        this.logFn("スクリプトがロードされました。");
    }

    /**
     * トークンのリストからASTを構築します。
     * @param tokens トークンの配列
     * @returns Program ASTノード
     */
    parse(tokens: Token[]): Program {
        const body: Statement[] = [];
        let index = 0;

        while (index < tokens.length) {
            const token = tokens[index];
            
            if (!token) {
                break;
            }

            // コメントや空行をスキップ
            if (token.type === TokenType.COMMENT) {
                index++;
                continue;
            }

            // 改行ステートメント (/)
            if (token.type === TokenType.SLASH) {
                body.push({
                    type: 'NewlineStatement',
                });
                index++;
                continue;
            }

            // 出力ステートメント (?=)
            if (token.type === TokenType.QUESTION && index + 2 < tokens.length) {
                const nextToken = tokens[index + 1];
                const valueToken = tokens[index + 2];
                
                if (nextToken && valueToken && nextToken.type === TokenType.EQUALS) {
                    const expression = this.parseExpression(valueToken);
                    
                    body.push({
                        type: 'OutputStatement',
                        expression,
                    });
                    
                    index += 3;
                    continue;
                }
            }

            // 代入ステートメントの解析
            if (token.type === TokenType.IDENTIFIER && index + 2 < tokens.length) {
                const nextToken = tokens[index + 1];
                const valueToken = tokens[index + 2];
                
                if (nextToken && valueToken && nextToken.type === TokenType.EQUALS) {
                    const variable: Identifier = {
                        type: 'Identifier',
                        name: token.value,
                    };
                    const value = this.parseExpression(valueToken);
                    
                    body.push({
                        type: 'AssignmentStatement',
                        variable,
                        value,
                    });
                    
                    index += 3;
                    continue;
                }
            }

            // その他のトークンがあればエラー
            throw new Error(`構文エラー: 予期しないトークン '${token.value}' (行: ${token.line + 1}, 列: ${token.column + 1})`);
        }

        return {
            type: 'Program',
            body,
        };
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
            };
        }
        
        if (token.type === TokenType.STRING) {
            return {
                type: 'StringLiteral',
                value: token.value,
            };
        }
        
        if (token.type === TokenType.IDENTIFIER) {
            return {
                type: 'Identifier',
                name: token.value,
            };
        }

        throw new Error(`構文エラー: 無効な式トークン '${token.value}' (行: ${token.line + 1})`);
    }

    // TODO: 必要に応じて、式評価、変数解決などのヘルパーメソッドを追加
    // private evaluateExpression(expression: string, state: InterpreterState): number | string { ... }
    // private getVariableValue(name: string, state: InterpreterState): number { ... }
    // private setVariableValue(name: string, value: number, state: InterpreterState): void { ... }
}

export default WorkerInterpreter;
