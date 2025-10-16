/**
 * AST (抽象構文木) のノード定義
 * WorkerScriptの構文構造を表現するための型定義
 */

/**
 * AST (抽象構文木) のノードの基本型
 */
export interface ASTNode {
    type: string;
    line: number;      // ソースコードの行番号（0-indexed）
    column?: number;   // オプション：列番号
}

/**
 * プログラムの1行を表す構造
 */
export interface Line {
    lineNumber: number;           // 行番号（0-indexed）
    statements: Statement[];      // その行に含まれるステートメントの配列
    sourceText?: string;          // デバッグ用の元のソースコード
}

/**
 * プログラム全体を表すASTノード
 */
export interface Program extends ASTNode {
    type: 'Program';
    body: Line[];  // Statement[]ではなくLine[]
}

/**
 * ステートメントを表すASTノード
 */
export type Statement = 
    | AssignmentStatement 
    | OutputStatement 
    | NewlineStatement
    | IfStatement
    | GotoStatement
    | GosubStatement
    | ReturnStatement
    | HaltStatement;

/**
 * 代入ステートメント (例: A=10)
 */
export interface AssignmentStatement extends ASTNode {
    type: 'AssignmentStatement';
    variable: Identifier;
    value: Expression;
}

/**
 * 出力ステートメント (例: ?=10, ?="Hello")
 */
export interface OutputStatement extends ASTNode {
    type: 'OutputStatement';
    expression: Expression;
}

/**
 * 改行ステートメント (/)
 */
export interface NewlineStatement extends ASTNode {
    type: 'NewlineStatement';
}

/**
 * IF条件分岐ステートメント (例: ;=A>100)
 * VTL仕様: 条件が偽の場合、同じ行の後続ステートメントをスキップする
 * インタプリタ側で制御フローを処理する
 */
export interface IfStatement extends ASTNode {
    type: 'IfStatement';
    condition: Expression;
    // consequentは削除：後続ステートメントは同じLine.statements[]内に独立して存在
}

/**
 * GOTOステートメント (例: #=100)
 * 指定した行番号に無条件ジャンプ
 */
export interface GotoStatement extends ASTNode {
    type: 'GotoStatement';
    target: Expression; // 行番号を表す式
}

/**
 * GOSUBステートメント (例: !=200)
 * 指定した行番号にサブルーチンコール
 */
export interface GosubStatement extends ASTNode {
    type: 'GosubStatement';
    target: Expression; // 行番号を表す式
}

/**
 * RETURNステートメント (])
 * サブルーチンから戻る
 */
export interface ReturnStatement extends ASTNode {
    type: 'ReturnStatement';
}

/**
 * HALTステートメント (#=-1)
 * プログラムの実行を停止
 */
export interface HaltStatement extends ASTNode {
    type: 'HaltStatement';
}

/**
 * 式を表すASTノード
 */
export type Expression = 
    | NumericLiteral 
    | StringLiteral 
    | Identifier
    | BinaryExpression; // UnaryExpression など、他の式型も追加予定

/**
 * 数値リテラル
 * WorkerScriptの数値は16bit符号付き整数 (-32768 ~ 32767)
 * 演算結果がこの範囲を超える場合はラップアラウンド
 */
export interface NumericLiteral extends ASTNode {
    type: 'NumericLiteral';
    value: number;  // -32768 ~ 32767 の範囲
}

/**
 * 文字列リテラル
 */
export interface StringLiteral extends ASTNode {
    type: 'StringLiteral';
    value: string;
}

/**
 * 変数識別子
 */
export interface Identifier extends ASTNode {
    type: 'Identifier';
    name: string;
}

/**
 * 二項演算式 (例: A+B, 10*5)
 */
export interface BinaryExpression extends ASTNode {
    type: 'BinaryExpression';
    operator: string; // '+', '-', '*', '/', '>', '<', '>=', '<=', '=', '<>', '&', '|'
    left: Expression;
    right: Expression;
}
