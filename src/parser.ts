// src/parser.ts

import { Lexer, TokenType, type Token } from './lexer.js';
import type { Program, Statement, Expression, Line, ForStatement, WhileStatement } from './ast.js';
import {
    isForStatement,
    isWhileStatement,
    isIfStatement,
} from './ast.js';

/**
 * Parserクラス
 * スクリプトを字句解析し、ASTを構築します。
 * WorkerInterpreterから独立したパーサー機能を提供します。
 */
export class Parser {
    private lexer: Lexer;
    // 解析用の一時的な状態（parse呼び出しごとに初期化）
    private scriptLines: string[] = [];
    private tokens: Token[][] = [];

    constructor() {
        this.lexer = new Lexer();
    }

    /**
     * スクリプト文字列を解析し、ProgramとラベルマップNULLを返します。
     * @param script 解析対象のスクリプト文字列
     * @returns { program: Program, labels: Map<string, number> }
     */
    public parse(script: string): { program: Program; labels: Map<string, number> } {
        // 解析用の状態（parse呼び出しごとに初期化）
        this.scriptLines = [];
        const labels: Map<string, number> = new Map();
        this.tokens = [];

        // スクリプトを行に分割
        const rawLines = script.split('\n');

        // 各行をトークン化
        rawLines.forEach((line, index) => {
            this.scriptLines.push(line);
            const lineTokens = this.lexer.tokenizeLine(line, index);

            // ラベル定義の検出
            if (lineTokens.length > 0 && lineTokens[0]?.type === TokenType.LABEL_DEFINITION) {
                const firstToken = lineTokens[0];
                if (firstToken) {
                    const labelName = firstToken.value.slice(1); // ^ を除去
                    labels.set(labelName, index);
                }
                // ラベルトークンを除外
                this.tokens.push(lineTokens.slice(1));
            } else {
                this.tokens.push(lineTokens);
            }
        });

        // ASTの構築
        const program = this.buildProgramAST();

        return { program, labels };
    }
    private buildProgramAST(): Program {
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

        return {
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

        // 行をパースしてステートメント配列を取得
        const parsedStatements = this.parseLineStatements(sourceText, lineNumber);
        
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
        // 先頭がIfStatementかチェック
        if (parsedStatements.length > 0 && parsedStatements[0]?.type === 'IfStatement') {
            const inlineIf = parsedStatements[0] as any;
            
            // IfBlockStatementに変換
            const blockIf: any = {
                type: 'IfBlockStatement',
                line: lineNumber,
                condition: inlineIf.condition,
                thenBody: [],
                elseBody: undefined,
            };
            
            // 同じ行の残りのステートメントをthenBodyに追加
            if (parsedStatements.length > 1) {
                blockIf.thenBody = parsedStatements.slice(1);
                // インライン形式（同じ行に後続ステートメント）
                const line: Line = {
                    lineNumber: lineNumber,
                    statements: [blockIf],
                    sourceText: sourceText,
                };
                return { line, endLine: lineNumber };
            } else {
                // ブロック形式（単独行）
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
        }
        
        return null;
    }

    /**
     * 行をパースしてステートメント配列を返します。
     * 空白で分割し、各ステートメント文字列を基本パースします。
     * 
     * @param sourceText パース対象の行テキスト
     * @param lineNumber 行番号
     * @returns パースされたステートメント配列
     */
    private parseLineStatements(sourceText: string, lineNumber: number): Statement[] {
        const stmtStrings = this.splitLineByWhitespace(sourceText);
        const parsedStatements: Statement[] = [];
        
        for (const stmtString of stmtStrings) {
            const stmt = this.parseStatementString(stmtString, lineNumber);
            if (stmt) {
                parsedStatements.push(stmt);
            }
        }
        
        return parsedStatements;
    }

    /**
     * 単独のステートメントがブロック構造（FOR/WHILE/IF）の場合、
     * 対応するブロックステートメントに変換します。
     * 
     * @param parsedStatements パース済みステートメント配列
     * @param lineNumber 行番号
     * @param detectIf IFブロックを検出するか（collectIfBlock内では無効にする）
     * @returns ブロックステートメントと終端行番号、またはnull
     */
    private detectAndConvertBlockStructure(
        parsedStatements: Statement[],
        lineNumber: number,
        detectIf: boolean = true
    ): { blockStmt: any; endLine: number } | null {
        // 単独のステートメントでない場合はブロック検出しない
        if (parsedStatements.length !== 1) {
            return null;
        }
        
        const stmt = parsedStatements[0];
        if (!stmt) {
            return null;
        }
        
        // FORループの検出
        if (isForStatement(stmt)) {
            const innerBody = this.collectLoopBlock(lineNumber + 1);
            const blockStmt: any = {
                type: 'ForBlockStatement',
                line: lineNumber,
                variable: stmt.variable,
                start: stmt.start,
                end: stmt.end,
                step: stmt.step,
                body: innerBody.body,
            };
            return { blockStmt, endLine: innerBody.endLine };
        }
        
        // WHILEループの検出
        if (isWhileStatement(stmt)) {
            const innerBody = this.collectLoopBlock(lineNumber + 1);
            const blockStmt: any = {
                type: 'WhileBlockStatement',
                line: lineNumber,
                condition: stmt.condition,
                body: innerBody.body,
            };
            return { blockStmt, endLine: innerBody.endLine };
        }
        
        // IFブロックの検出（detectIfがtrueの場合のみ）
        if (detectIf && isIfStatement(stmt)) {
            const blockStmt: any = {
                type: 'IfBlockStatement',
                line: lineNumber,
                condition: stmt.condition,
                thenBody: [],
                elseBody: [],
            };
            const endLine = this.collectIfBlock(blockStmt, lineNumber + 1);
            return { blockStmt, endLine };
        }
        
        return null;
    }

    /**
     * インラインループステートメント（ForStatementまたはWhileStatement）を
     * ブロックループステートメント（ForBlockStatementまたはWhileBlockStatement）に変換します。
     * 
     * @param inlineStmt 変換元のインラインループステートメント
     * @param sourceText ソース行のテキスト
     * @param lineNumber 行番号
     * @returns 変換されたブロックループステートメントを含むLineと終端行番号
     */
    private convertInlineLoopToBlock(
        inlineStmt: ForStatement | WhileStatement,
        sourceText: string,
        lineNumber: number
    ): { line: Line; endLine: number } {
        // #=@ まで本体を収集
        const { body, endLine } = this.collectLoopBlock(lineNumber + 1);
        
        let blockStmt: any;
        if (isForStatement(inlineStmt)) {
            // ForBlockStatementに変換
            blockStmt = {
                type: 'ForBlockStatement',
                line: lineNumber,
                variable: inlineStmt.variable,
                start: inlineStmt.start,
                end: inlineStmt.end,
                step: inlineStmt.step,
                body: body,
            };
        } else {
            // WhileBlockStatementに変換
            blockStmt = {
                type: 'WhileBlockStatement',
                line: lineNumber,
                condition: inlineStmt.condition,
                body: body,
            };
        }
        
        // ブロック全体を1つのステートメントとして追加
        const line: Line = {
            lineNumber: lineNumber,
            statements: [blockStmt],
            sourceText: sourceText,
        };
        
        return { line, endLine };
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
            return this.convertInlineLoopToBlock(parsedStatements[0], sourceText, lineNumber);
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
            return this.convertInlineLoopToBlock(parsedStatements[0], sourceText, lineNumber);
        }
        
        return null;
    }

    // ==================== ヘルパーメソッド ====================

    /**
     * シンプルなステートメントオブジェクトを構築します。
     * 繰り返されるステートメント構築パターンを共通化します。
     */
    private createSimpleStatement(
        type: string,
        token: Token,
        nextIndex: number,
        additionalProps?: Record<string, any>
    ): { statement: Statement; nextIndex: number } {
        return {
            statement: {
                type,
                line: token.line,
                column: token.column,
                ...additionalProps
            } as Statement,
            nextIndex
        };
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

            // 行をパースしてステートメント配列を取得
            const parsedStatements = this.parseLineStatements(sourceText, i);
            
            // ブロック構造を検出（IFブロックは検出しない - 無限再帰を防ぐ）
            const blockInfo = this.detectAndConvertBlockStructure(parsedStatements, i, true);
            if (blockInfo) {
                currentBody.push(blockInfo.blockStmt);
                // ブロックの終端までスキップ
                i = blockInfo.endLine;
                continue;
            }
            
            // インラインIF文を IfBlockStatement に変換
            if (parsedStatements.length > 0 && parsedStatements[0]?.type === 'IfStatement') {
                const inlineIf = parsedStatements[0] as any;
                const blockIf: any = {
                    type: 'IfBlockStatement',
                    line: i,
                    condition: inlineIf.condition,
                    thenBody: parsedStatements.slice(1),
                    elseBody: undefined,
                };
                currentBody.push(blockIf);
                continue;
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

            // 行をパースしてステートメント配列を取得
            const parsedStatements = this.parseLineStatements(sourceText, i);
            
            // ブロック構造を検出
            const blockInfo = this.detectAndConvertBlockStructure(parsedStatements, i, true);
            if (blockInfo) {
                body.push(blockInfo.blockStmt);
                // ブロックの終端までスキップ
                i = blockInfo.endLine;
                continue;
            }
            
            // インラインIF文を IfBlockStatement に変換
            if (parsedStatements.length > 0 && parsedStatements[0]?.type === 'IfStatement') {
                const inlineIf = parsedStatements[0] as any;
                const blockIf: any = {
                    type: 'IfBlockStatement',
                    line: i,
                    condition: inlineIf.condition,
                    thenBody: parsedStatements.slice(1),
                    elseBody: undefined,
                };
                body.push(blockIf);
                continue;
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
                return this.createSimpleStatement('ReturnStatement', token, startIndex + 3);
            }

            // #=@ パターン（NEXT文）
            if (thirdToken.type === TokenType.AT) {
                return this.createSimpleStatement('NextStatement', token, startIndex + 3);
            }

            // #=^LABEL パターン（GOTO）
            if (thirdToken.type === TokenType.LABEL_DEFINITION) {
                const labelName = thirdToken.value.substring(1);
                return this.createSimpleStatement('GotoStatement', token, startIndex + 3, { target: labelName });
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

        // #=@ パターン（NEXT文）
        if (thirdToken.type === TokenType.AT) {
            return {
                type: 'NextStatement',
                line: firstToken.line,
                column: firstToken.column,
            };
        }

        // #=^LABEL パターン（GOTO）
        if (thirdToken.type === TokenType.LABEL_DEFINITION) {
            const labelName = thirdToken.value.substring(1);
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

        if (token.type === TokenType.QUESTION) {
            return {
                type: 'InputNumberExpression',
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

        // Compare-And-Swap式 <&expected,newValue>
        if (token.type === TokenType.LESS_THAN) {
            const nextToken = tokens[start + 1];
            if (nextToken && nextToken.type === TokenType.AMPERSAND) {
                // <& の形式を検出
                // 対応する > を見つける
                let depth = 1;
                let endIndex = start + 2;
                while (endIndex < tokens.length && depth > 0) {
                    if (tokens[endIndex]?.type === TokenType.LESS_THAN) {
                        depth++;
                    } else if (tokens[endIndex]?.type === TokenType.GREATER_THAN) {
                        depth--;
                    }
                    if (depth > 0) {
                        endIndex++;
                    }
                }

                if (depth !== 0) {
                    throw new Error(`構文エラー: CAS式が閉じられていません (行: ${token.line + 1})`);
                }

                // <& と > の間のトークンを取得
                const innerTokens = tokens.slice(start + 2, endIndex);
                if (innerTokens.length === 0) {
                    throw new Error(`構文エラー: CAS式が空です (行: ${token.line + 1})`);
                }

                // カンマで分割して期待値と新値を取得
                let commaIndex = -1;
                let parenDepth = 0;
                let bracketDepth = 0;
                for (let i = 0; i < innerTokens.length; i++) {
                    const t = innerTokens[i];
                    if (t!.type === TokenType.LEFT_PAREN) parenDepth++;
                    if (t!.type === TokenType.RIGHT_PAREN) parenDepth--;
                    if (t!.type === TokenType.LEFT_BRACKET) bracketDepth++;
                    if (t!.type === TokenType.RIGHT_BRACKET) bracketDepth--;
                    if (t!.type === TokenType.COMMA && parenDepth === 0 && bracketDepth === 0) {
                        commaIndex = i;
                        break;
                    }
                }

                if (commaIndex === -1) {
                    throw new Error(`構文エラー: CAS式にカンマが必要です (行: ${token.line + 1})`);
                }

                const expectedTokens = innerTokens.slice(0, commaIndex);
                const newValueTokens = innerTokens.slice(commaIndex + 1);

                if (expectedTokens.length === 0 || newValueTokens.length === 0) {
                    throw new Error(`構文エラー: CAS式の引数が不完全です (行: ${token.line + 1})`);
                }

                const expectedExpr = this.parseBinaryExpression(expectedTokens, 0);
                const newValueExpr = this.parseBinaryExpression(newValueTokens, 0);

                return {
                    expr: {
                        type: 'CompareAndSwapExpression',
                        expected: expectedExpr.expr,
                        newValue: newValueExpr.expr,
                        line: token.line,
                        column: token.column,
                    },
                    nextIndex: endIndex + 1,
                };
            }
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
            TokenType.QUESTION,
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
}
