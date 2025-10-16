// src/workerInterpreter.ts

import { Lexer, TokenType, type Token } from './lexer';
import type { Program, Statement, Expression, Identifier, NumericLiteral, StringLiteral, Line } from './ast';

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
    private program: Program | null = null; // 構築されたプログラムAST
    private lexer: Lexer; // Lexerのインスタンス
    private gridData: number[];
    private peekFn: (index: number) => number;
    private pokeFn: (index: number, value: number) => void;
    private logFn: (...args: any[]) => void;
    private variables: Map<string, number> = new Map(); // 変数の状態 (A-Z)

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

            // コメント行や空行はステートメントなしの行として扱う
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

            // ラベル定義行もステートメントなしとして扱う（実行時はスキップ）
            if (lineTokens.length === 1 && lineTokens[0]?.type === TokenType.LABEL_DEFINITION) {
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
                const parsedProgram = this.parse(lineTokens);
                // parse()は常に1つのLineを含むProgramを返す
                const parsedLine = parsedProgram.body[0];
                if (parsedLine) {
                    const line: Line = {
                        lineNumber: i,
                        statements: parsedLine.statements,
                    };
                    const sourceText = this.scriptLines[i];
                    if (sourceText !== undefined) {
                        line.sourceText = sourceText;
                    }
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
     * トークンのリストからASTを構築します。
     * @param tokens トークンの配列
     * @returns Program ASTノード
     */
    parse(tokens: Token[]): Program {
        const statements: Statement[] = [];
        let index = 0;

        // プログラムの行番号は最初のトークンから取得、なければ0
        const programLine = tokens[0]?.line ?? 0;

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
                statements.push({
                    type: 'NewlineStatement',
                    line: token.line,
                    column: token.column,
                });
                index++;
                continue;
            }

            // RETURNステートメント (])
            if (token.type === TokenType.RIGHT_BRACKET) {
                statements.push({
                    type: 'ReturnStatement',
                    line: token.line,
                    column: token.column,
                });
                index++;
                continue;
            }

            // GOTOステートメント (#=^LABEL) と HALTステートメント (#=-1)
            if (token.type === TokenType.HASH) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    const thirdToken = tokens[index + 2];
                    
                    // #=-1 の場合はHALTステートメント（特殊ケース）
                    if (thirdToken && thirdToken.type === TokenType.MINUS) {
                        const fourthToken = tokens[index + 3];
                        if (fourthToken && fourthToken.type === TokenType.NUMBER && 
                            fourthToken.value === '1') {
                            statements.push({
                                type: 'HaltStatement',
                                line: token.line,
                                column: token.column,
                            });
                            // #=-1 は4トークン消費
                            index += 4;
                            continue;
                        }
                    }
                    
                    // #=^LABEL パターン（通常のGOTO）
                    if (thirdToken && thirdToken.type === TokenType.LABEL_DEFINITION) {
                        const labelName = thirdToken.value.substring(1); // ^ を除去
                        statements.push({
                            type: 'GotoStatement',
                            line: token.line,
                            column: token.column,
                            target: labelName,
                        });
                        // #=^LABEL は3トークン消費
                        index += 3;
                        continue;
                    }
                    
                    // ラベル以外が指定された場合はエラー
                    throw new Error(`構文エラー: GOTOにはラベル（^LABEL形式）が必要です (行: ${token.line + 1}, 列: ${token.column + 1})`);
                }
            }

            // GOSUBステートメント (!=^LABEL)
            if (token.type === TokenType.BANG) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    const thirdToken = tokens[index + 2];
                    
                    // !=^LABEL パターン
                    if (thirdToken && thirdToken.type === TokenType.LABEL_DEFINITION) {
                        const labelName = thirdToken.value.substring(1); // ^ を除去
                        statements.push({
                            type: 'GosubStatement',
                            line: token.line,
                            column: token.column,
                            target: labelName,
                        });
                        // !=^LABEL は3トークン消費
                        index += 3;
                        continue;
                    }
                    
                    // ラベル以外が指定された場合はエラー
                    throw new Error(`構文エラー: GOSUBにはラベル（^LABEL形式）が必要です (行: ${token.line + 1}, 列: ${token.column + 1})`);
                }
            }

            // IFステートメント (;=)
            if (token.type === TokenType.SEMICOLON) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    // ;= の後の条件式を解析
                    const exprResult = this.parseExpressionFromTokens(tokens.slice(index + 2));
                    
                    statements.push({
                        type: 'IfStatement',
                        line: token.line,
                        column: token.column,
                        condition: exprResult.expr,
                    });
                    
                    index += 2 + exprResult.consumed; // ;= + 式
                    continue;
                }
            }

            // 出力ステートメント (?=)
            if (token.type === TokenType.QUESTION) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    // ?= の後から次のステートメント開始位置まで式を解析
                    const exprStart = index + 2;
                    let exprEnd = exprStart;
                    while (exprEnd < tokens.length) {
                        const t = tokens[exprEnd];
                        if (!t) break;
                        
                        // IDENTIFIERの後に=がある場合は代入ステートメント
                        if (t.type === TokenType.IDENTIFIER) {
                            const nextT = tokens[exprEnd + 1];
                            if (nextT && nextT.type === TokenType.EQUALS) {
                                break; // 代入ステートメントなので式の終わり
                            }
                        } else if (this.isStatementStart(t.type)) {
                            break; // 他のステートメント開始
                        }
                        
                        exprEnd++;
                    }
                    
                    const exprTokens = tokens.slice(exprStart, exprEnd);
                    const exprResult = this.parseExpressionFromTokens(exprTokens);
                    
                    statements.push({
                        type: 'OutputStatement',
                        line: token.line,
                        column: token.column,
                        expression: exprResult.expr,
                    });
                    
                    // ?= + 式
                    index += 2 + exprResult.consumed;
                    continue;
                }
            }

            // NEXTステートメント (@=I)
            if (token.type === TokenType.AT) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    const thirdToken = tokens[index + 2];
                    
                    if (thirdToken && thirdToken.type === TokenType.IDENTIFIER) {
                        statements.push({
                            type: 'NextStatement',
                            line: token.line,
                            column: token.column,
                            variable: {
                                type: 'Identifier',
                                name: thirdToken.value,
                                line: thirdToken.line,
                                column: thirdToken.column,
                            },
                        });
                        // @=I は3トークン消費
                        index += 3;
                        continue;
                    }
                    
                    throw new Error(`構文エラー: NEXTには変数が必要です (行: ${token.line + 1}, 列: ${token.column + 1})`);
                }
            }

            // POKEステートメント ($=expression)
            if (token.type === TokenType.DOLLAR) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    // = の後から式を解析
                    const exprResult = this.parseExpressionFromTokens(tokens.slice(index + 2));
                    
                    statements.push({
                        type: 'PokeStatement',
                        line: token.line,
                        column: token.column,
                        value: exprResult.expr,
                    });
                    
                    // $= + 式
                    index += 2 + exprResult.consumed;
                    continue;
                }
            }

            // 代入ステートメント または FORループの解析
            if (token.type === TokenType.IDENTIFIER) {
                const nextToken = tokens[index + 1];
                
                if (nextToken && nextToken.type === TokenType.EQUALS) {
                    const variable: Identifier = {
                        type: 'Identifier',
                        name: token.value,
                        line: token.line,
                        column: token.column,
                    };
                    
                    // = の後の式を解析（カンマも演算子として解析される）
                    const exprResult = this.parseExpressionFromTokens(tokens.slice(index + 2));
                    
                    // 式がカンマを含むBinaryExpressionかチェック（FORループ判定）
                    if (this.isCommaExpression(exprResult.expr)) {
                        // FORループ: I=start,end[,step]
                        const parts = this.extractCommaExpressionParts(exprResult.expr);
                        
                        if (parts.length === 2) {
                            // I=start,end（ステップ省略）
                            statements.push({
                                type: 'ForStatement',
                                line: token.line,
                                column: token.column,
                                variable,
                                start: parts[0]!,
                                end: parts[1]!,
                            });
                        } else if (parts.length === 3) {
                            // I=start,end,step
                            statements.push({
                                type: 'ForStatement',
                                line: token.line,
                                column: token.column,
                                variable,
                                start: parts[0]!,
                                end: parts[1]!,
                                step: parts[2]!,
                            });
                        } else {
                            throw new Error(`構文エラー: FORループの式が不正です (行: ${token.line + 1}, 列: ${token.column + 1})`);
                        }
                    } else {
                        // 通常の代入ステートメント
                        statements.push({
                            type: 'AssignmentStatement',
                            line: token.line,
                            column: token.column,
                            variable,
                            value: exprResult.expr,
                        });
                    }
                    index += 2 + exprResult.consumed; // variable= + 式
                    
                    continue;
                }
            }

            // その他のトークンがあればエラー
            throw new Error(`構文エラー: 予期しないトークン '${token.value}' (行: ${token.line + 1}, 列: ${token.column + 1})`);
        }

        // Statement[]をLine[]でラップする
        const body: Line[] = [{
            lineNumber: programLine,
            statements: statements,
        }];

        return {
            type: 'Program',
            line: programLine,
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
                    line: left.expr.line, // 左辺の行番号を使用
                };
            } else {
                // 演算子でない場合は終了
                break;
            }
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
     * トークンがステートメントの開始を示すかどうかを判定します。
     * @param tokenType トークンタイプ
     * @returns ステートメント開始の場合true
     */
    private isStatementStart(tokenType: TokenType): boolean {
        return [
            TokenType.QUESTION,      // ?= (出力)
            TokenType.IDENTIFIER,    // 変数名 (代入の可能性)
            TokenType.SEMICOLON,     // ;= (IF)
            TokenType.HASH,          // #= (GOTO/停止)
            TokenType.BANG,          // != (GOSUB)
            TokenType.RIGHT_BRACKET, // ] (RETURN)
            TokenType.AT,            // @= (NEXT)
            TokenType.SLASH,         // / (改行)
            TokenType.DOLLAR,        // $= (POKE)
        ].includes(tokenType);
    }

    /**
     * 次のステートメントの開始位置を見つけます
     * @param tokens トークン配列
     * @param startIndex 検索開始位置
     * @returns 次のステートメントの開始インデックス、見つからなければtokens.length
     */
    private findNextStatementStart(tokens: Token[], startIndex: number): number {
        for (let i = startIndex; i < tokens.length; i++) {
            const token = tokens[i];
            if (token && this.isStatementStart(token.type)) {
                return i;
            }
        }
        return tokens.length;
    }

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

        // 変数をリセット
        this.variables.clear();

        // 各行のステートメントを順次実行
        for (const line of this.program.body) {
            for (const statement of line.statements) {
                this.executeStatement(statement);
                // 1ステートメント実行後にyieldして制御を返す
                yield;
            }
        }
    }

    /**
     * 単一のステートメントを実行します。
     * @param statement 実行するステートメント
     */
    private executeStatement(statement: Statement): void {
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
            
            default:
                throw new Error(`未実装のステートメント: ${statement.type}`);
        }
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
                        default:
                            throw new Error(`未実装の演算子: ${expr.operator}`);
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
