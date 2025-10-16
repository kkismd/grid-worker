// src/workerInterpreter.ts

import { Lexer, TokenType, type Token } from './lexer.js';
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral, Line } from './ast.js';

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
    forLineIndex: number; // FORステートメントの行番号（ループの先頭に戻るため）
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
    private variables: Map<string, number> = new Map(); // 変数の状態 (A-Z)
    private currentLineIndex: number = 0; // 現在実行中の行インデックス
    private callStack: number[] = []; // GOSUBのリターンアドレススタック
    private loopStack: LoopInfo[] = []; // FORループの状態スタック

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

            // コメント行、空行、ラベル定義行はステートメントなしの行として扱う
            if (lineTokens.length === 0 || 
                (lineTokens.length === 1 && lineTokens[0]?.type === TokenType.COMMENT)) {
                const line: Line = {
                    lineNumber: i,
                    statements: [],
                };
                const sourceText = this.scriptLines[i];
                if (sourceText !== undefined) {
                    line.sourceText = sourceText;
                }
                lines.push(line);
                continue;
            }

            // 通常の行をパース
            try {
                // 新しいアプローチ: 行を空白で分割してから各ステートメントをパース
                const sourceText = this.scriptLines[i];
                if (sourceText) {
                    const stmtStrings = this.splitLineByWhitespace(sourceText);
                    const parsedStatements: Statement[] = [];
                    
                    for (const stmtString of stmtStrings) {
                        const stmt = this.parseStatementString(stmtString, i);
                        if (stmt) {
                            parsedStatements.push(stmt);
                        }
                    }
                    
                    const line: Line = {
                        lineNumber: i,
                        statements: parsedStatements,
                        sourceText: sourceText,
                    };
                    lines.push(line);
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
     * トークンのリストからASTを構築します（テスト用の互換性メソッド）。
     * 
     * @internal このメソッドはPhase 2のテスト互換性のために残されています。
     * 本番コードでは使用されず、loadScript()内で自動的にparseStatementString()が呼ばれます。
     * 
     * @deprecated Phase 3完了後、テストをloadScript()ベースに書き換えて削除予定。
     * 中長期的には以下のように書き換えを推奨：
     * ```
     * // 現在: const ast = interpreter.parse(lexer.tokenizeLine(...));
     * // 将来: const program = interpreter.loadScript("A=10 B=20");
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
            return {
                statement: {
                    type: 'NewlineStatement',
                    line: token.line,
                    column: token.column,
                },
                nextIndex: startIndex + 1
            };
        }

        // RETURNステートメント (])
        if (token.type === TokenType.RIGHT_BRACKET) {
            return {
                statement: {
                    type: 'ReturnStatement',
                    line: token.line,
                    column: token.column,
                },
                nextIndex: startIndex + 1
            };
        }

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

        // NEXTステートメント (@=I)
        if (token.type === TokenType.AT) {
            const thirdToken = tokens[startIndex + 2];
            
            if (!thirdToken || thirdToken.type !== TokenType.IDENTIFIER) {
                throw new Error(`構文エラー: NEXTにはループ変数が必要です`);
            }

            return {
                statement: {
                    type: 'NextStatement',
                    line: token.line,
                    column: token.column,
                    variable: {
                        type: 'Identifier',
                        name: thirdToken.value,
                        line: thirdToken.line,
                        column: thirdToken.column,
                    },
                },
                nextIndex: startIndex + 3
            };
        }

        // POKEステートメント ($=expression)
        if (token.type === TokenType.DOLLAR) {
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

        // 代入ステートメント または FORループ
        if (token.type === TokenType.IDENTIFIER) {
            const exprTokens = tokens.slice(startIndex + 2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);

            // カンマ式かどうかでFORループか代入かを判定
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
                                name: token.value,
                                line: token.line,
                                column: token.column,
                            },
                            start: parts[0]!,
                            end: parts[1]!,
                            // stepは省略（デフォルト1）
                        },
                        nextIndex: startIndex + 2 + exprResult.consumed
                    };
                } else if (parts.length === 3) {
                    return {
                        statement: {
                            type: 'ForStatement',
                            line: token.line,
                            column: token.column,
                            variable: {
                                type: 'Identifier',
                                name: token.value,
                                line: token.line,
                                column: token.column,
                            },
                            start: parts[0]!,
                            end: parts[1]!,
                            step: parts[2]!,
                        },
                        nextIndex: startIndex + 2 + exprResult.consumed
                    };
                } else {
                    throw new Error(`構文エラー: FORループの形式が不正です`);
                }
            } else {
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
        }

        throw new Error(`構文エラー: 未知のステートメント形式: ${token.value}`);
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

        if (token.type === TokenType.DOLLAR) {
            return {
                type: 'PeekExpression',
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
        // 5: 乗除算 (*, /)
        // 4: 加減算 (+, -)
        // 3: 比較 (>, <, >=, <=, =, <>)
        // 2: 論理AND (&)
        // 1: 論理OR (|)
        
        switch (operator) {
            case '*':
            case '/':
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

        // RETURNステートメント (])
        if (firstToken.type === TokenType.RIGHT_BRACKET && tokens.length === 1) {
            return {
                type: 'ReturnStatement',
                line: firstToken.line,
                column: firstToken.column,
            };
        }

        // 2トークン以上必要なステートメント
        const secondToken = tokens[1];
        if (!secondToken) {
            throw new Error(`不完全なステートメント: ${stmtString}`);
        }

        // GOTOステートメント (#=^LABEL) と HALTステートメント (#=-1)
        if (firstToken.type === TokenType.HASH && secondToken.type === TokenType.EQUALS) {
            const thirdToken = tokens[2];
            
            if (!thirdToken) {
                throw new Error(`GOTO/HALTステートメントが不完全です`);
            }

            // #=-1 の場合はHALTステートメント
            if (thirdToken.type === TokenType.MINUS) {
                const fourthToken = tokens[3];
                if (fourthToken && fourthToken.type === TokenType.NUMBER && fourthToken.value === '1') {
                    return {
                        type: 'HaltStatement',
                        line: firstToken.line,
                        column: firstToken.column,
                    };
                }
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

        // NEXTステートメント (@=I)
        if (firstToken.type === TokenType.AT && secondToken.type === TokenType.EQUALS) {
            const thirdToken = tokens[2];
            
            if (!thirdToken || thirdToken.type !== TokenType.IDENTIFIER) {
                throw new Error(`構文エラー: NEXTにはループ変数が必要です`);
            }

            return {
                type: 'NextStatement',
                line: firstToken.line,
                column: firstToken.column,
                variable: {
                    type: 'Identifier',
                    name: thirdToken.value,
                    line: thirdToken.line,
                    column: thirdToken.column,
                },
            };
        }

        // POKEステートメント ($=expression)
        if (firstToken.type === TokenType.DOLLAR && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);
            
            return {
                type: 'PokeStatement',
                line: firstToken.line,
                column: firstToken.column,
                value: exprResult.expr,
            };
        }

        // 代入ステートメント または FORループ
        if (firstToken.type === TokenType.IDENTIFIER && secondToken.type === TokenType.EQUALS) {
            const exprTokens = tokens.slice(2);
            const exprResult = this.parseExpressionFromTokens(exprTokens);

            // カンマ式かどうかでFORループか代入かを判定
            if (this.isCommaExpression(exprResult.expr)) {
                const parts = this.extractCommaExpressionParts(exprResult.expr);
                
                if (parts.length === 2) {
                    return {
                        type: 'ForStatement',
                        line: firstToken.line,
                        column: firstToken.column,
                        variable: {
                            type: 'Identifier',
                            name: firstToken.value,
                            line: firstToken.line,
                            column: firstToken.column,
                        },
                        start: parts[0]!,
                        end: parts[1]!,
                        // stepは省略（デフォルト1）
                    };
                } else if (parts.length === 3) {
                    return {
                        type: 'ForStatement',
                        line: firstToken.line,
                        column: firstToken.column,
                        variable: {
                            type: 'Identifier',
                            name: firstToken.value,
                            line: firstToken.line,
                            column: firstToken.column,
                        },
                        start: parts[0]!,
                        end: parts[1]!,
                        step: parts[2]!,
                    };
                } else {
                    throw new Error(`構文エラー: FORループの形式が不正です`);
                }
            } else {
                return {
                    type: 'AssignmentStatement',
                    line: firstToken.line,
                    column: firstToken.column,
                    variable: {
                        type: 'Identifier',
                        name: firstToken.value,
                        line: firstToken.line,
                        column: firstToken.column,
                    },
                    value: exprResult.expr,
                };
            }
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

        // プログラム実行ループ
        while (this.currentLineIndex < this.program.body.length) {
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
                    this.currentLineIndex = returnLine;
                    return { jump: true, halt: false, skipRemaining: false };
                }
            
            case 'HaltStatement':
                {
                    return { jump: false, halt: true, skipRemaining: false };
                }
            
            case 'ForStatement':
                {
                    // FOR文: I=start,end[,step]
                    const varName = statement.variable.name;
                    const startValue = this.evaluateExpression(statement.start);
                    const endValue = this.evaluateExpression(statement.end);
                    const stepValue = statement.step 
                        ? this.evaluateExpression(statement.step) 
                        : 1;
                    
                    // 型チェック
                    if (typeof startValue === 'string' || typeof endValue === 'string' || typeof stepValue === 'string') {
                        throw new Error('FORループのパラメータは数値でなければなりません');
                    }
                    
                    // ステップ値が0の場合はエラー
                    if (stepValue === 0) {
                        throw new Error('FORループのステップ値は0にできません');
                    }
                    
                    // ネストチェック: 同じ変数が既にループスタックにあるか
                    if (this.loopStack.some(loop => loop.variable === varName)) {
                        throw new Error(`ループ変数${varName}は既に使用されています`);
                    }
                    
                    // ネストの最大深度チェック
                    if (this.loopStack.length >= 256) {
                        throw new Error('FORループのネストが最大深度256を超えました');
                    }
                    
                    // ループ変数に開始値を設定
                    this.variables.set(varName, startValue);
                    
                    // 初回のループ条件チェック
                    const shouldExecute = stepValue > 0 
                        ? startValue <= endValue 
                        : startValue >= endValue;
                    
                    // ループ情報をスタックにpush
                    this.loopStack.push({
                        variable: varName,
                        start: startValue,
                        end: endValue,
                        step: stepValue,
                        forLineIndex: this.currentLineIndex,
                    });
                    
                    if (!shouldExecute) {
                        // ループをスキップ: NEXTを検索してその次の行にジャンプ
                        const nextLineIndex = this.findMatchingNext(varName, this.currentLineIndex);
                        if (nextLineIndex !== -1) {
                            this.currentLineIndex = nextLineIndex + 1;
                            // NEXTはスキップするので、ループ情報をpop
                            this.loopStack.pop();
                            return { jump: true, halt: false, skipRemaining: false };
                        }
                        // NEXTが見つからない場合は続行（NEXTでpopされる）
                    }
                }
                break;
            
            case 'NextStatement':
                {
                    // NEXT文: @=I
                    const varName = statement.variable.name;
                    
                    // ループスタックが空の場合はエラー
                    if (this.loopStack.length === 0) {
                        throw new Error('NEXT文に対応するFORループがありません');
                    }
                    
                    // 最新のループ情報を取得
                    const currentLoop = this.loopStack[this.loopStack.length - 1];
                    if (!currentLoop) {
                        throw new Error('NEXT文に対応するFORループがありません');
                    }
                    
                    // ループ変数が一致するかチェック
                    if (currentLoop.variable !== varName) {
                        throw new Error(`NEXT文のループ変数${varName}が現在のFORループの変数${currentLoop.variable}と一致しません`);
                    }
                    
                    // ループ変数をインクリメント
                    const currentValue = this.variables.get(varName) || 0;
                    const newValue = currentValue + currentLoop.step;
                    this.variables.set(varName, newValue);
                    
                    // 次の値で条件チェック
                    const shouldContinue = currentLoop.step > 0 
                        ? newValue <= currentLoop.end 
                        : newValue >= currentLoop.end;
                    
                    if (shouldContinue) {
                        // ループ継続: FORステートメントの次の行にジャンプ
                        this.currentLineIndex = currentLoop.forLineIndex + 1;
                        return { jump: true, halt: false, skipRemaining: false };
                    } else {
                        // ループ終了: ループ情報をスタックからpop
                        this.loopStack.pop();
                        // 次のステートメントに進む（jump: false）
                    }
                }
                break;
            
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
                
                // 値を0-255の範囲にクランプ
                const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
                
                // pokeFnを呼び出し（X, Y座標と値を渡す）
                this.pokeFn(Math.floor(x), Math.floor(y), clampedValue);
                break;
            }
        }
        return { jump: false, halt: false, skipRemaining: false };
    }

    /**
     * 指定された変数名に対応するNEXT文の行番号を検索します。
     * @param varName ループ変数名
     * @param startLine 検索開始行番号
     * @returns NEXT文の行番号。見つからない場合は-1
     */
    private findMatchingNext(varName: string, startLine: number): number {
        if (!this.program) return -1;
        
        let nestLevel = 1; // 現在のFORのネストレベル
        
        for (let i = startLine + 1; i < this.program.body.length; i++) {
            const line = this.program.body[i];
            if (!line) continue;
            
            for (const statement of line.statements) {
                // 同じ変数のFORが見つかったらネストレベルを上げる
                if (statement.type === 'ForStatement' && statement.variable.name === varName) {
                    nestLevel++;
                }
                // 同じ変数のNEXTが見つかった
                if (statement.type === 'NextStatement' && statement.variable.name === varName) {
                    nestLevel--;
                    if (nestLevel === 0) {
                        // 対応するNEXTが見つかった
                        return i;
                    }
                }
            }
        }
        
        return -1; // 見つからなかった
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
