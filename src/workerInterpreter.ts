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
            if (token.type === TokenType.QUESTION) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    // ?= の後の全トークンを式として解析
                    const exprTokens = tokens.slice(index + 2);
                    const expression = this.parseExpressionFromTokens(exprTokens);
                    
                    body.push({
                        type: 'OutputStatement',
                        expression,
                    });
                    
                    // すべてのトークンを消費
                    index = tokens.length;
                    continue;
                }
            }

            // 代入ステートメントの解析
            if (token.type === TokenType.IDENTIFIER) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    const variable: Identifier = {
                        type: 'Identifier',
                        name: token.value,
                    };
                    // = の後の全トークンを式として解析
                    const exprTokens = tokens.slice(index + 2);
                    const value = this.parseExpressionFromTokens(exprTokens);
                    
                    body.push({
                        type: 'AssignmentStatement',
                        variable,
                        value,
                    });
                    
                    // すべてのトークンを消費
                    index = tokens.length;
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

    /**
     * トークンの配列から式を解析します（複数トークンの式をサポート）。
     * VTL系言語の仕様に従い、左から右へ評価します（括弧は優先順位を変更）。
     * @param tokens 式のトークン配列
     * @returns Expression ASTノード
     */
    private parseExpressionFromTokens(tokens: Token[]): Expression {
        if (tokens.length === 0) {
            throw new Error('構文エラー: 式が空です');
        }

        // 単一トークンの場合
        if (tokens.length === 1) {
            return this.parseExpression(tokens[0]!);
        }

        // 括弧がある場合の処理
        return this.parseBinaryExpression(tokens, 0).expr;
    }

    /**
     * 二項演算式を再帰的に解析します（左から右への評価）。
     * @param tokens トークン配列
     * @param start 開始インデックス
     * @returns 解析された式と次のインデックス
     */
    private parseBinaryExpression(tokens: Token[], start: number): { expr: Expression; nextIndex: number } {
        // 左辺を解析
        let left = this.parsePrimaryExpression(tokens, start);
        let index = left.nextIndex;

        // 演算子がある限り続ける
        while (index < tokens.length) {
            const token = tokens[index];
            if (!token) break;

            // 演算子かどうかチェック
            if (this.isBinaryOperator(token.type)) {
                const operator = token.value;
                index++;

                // 右辺を解析
                const right = this.parsePrimaryExpression(tokens, index);
                index = right.nextIndex;

                // 左結合で二項演算式を構築
                left.expr = {
                    type: 'BinaryExpression',
                    operator,
                    left: left.expr,
                    right: right.expr,
                };
            } else {
                // 演算子でない場合は終了
                break;
            }
        }

        return { expr: left.expr, nextIndex: index };
    }

    /**
     * 基本式（リテラル、識別子、括弧式）を解析します。
     * @param tokens トークン配列
     * @param start 開始インデックス
     * @returns 解析された式と次のインデックス
     */
    private parsePrimaryExpression(tokens: Token[], start: number): { expr: Expression; nextIndex: number } {
        const token = tokens[start];
        if (!token) {
            throw new Error('構文エラー: 式が不完全です');
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
        return [
            TokenType.PLUS,
            TokenType.MINUS,
            TokenType.ASTERISK,
            TokenType.SLASH,
            TokenType.EQUALS,           // 比較演算子としての =
            TokenType.GREATER_THAN,
            TokenType.LESS_THAN,
            TokenType.GREATER_THAN_OR_EQUAL,
            TokenType.LESS_THAN_OR_EQUAL,
            TokenType.NOT_EQUAL,
            TokenType.AMPERSAND,
            TokenType.PIPE,
        ].includes(tokenType);
    }

    // TODO: 必要に応じて、式評価、変数解決などのヘルパーメソッドを追加
    // private evaluateExpression(expression: string, state: InterpreterState): number | string { ... }
    // private getVariableValue(name: string, state: InterpreterState): number { ... }
    // private setVariableValue(name: string, value: number, state: InterpreterState): void { ... }
}

export default WorkerInterpreter;
