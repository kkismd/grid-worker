/**
 * AST (抽象構文木) のノード定義
 * WorkerScriptの構文構造を表現するための型定義
 */

/**
 * AST (抽象構文木) のノードの基本型
 */
export interface ASTNode {
    type: string;
}

/**
 * プログラム全体を表すASTノード
 */
export interface Program extends ASTNode {
    type: 'Program';
    body: Statement[];
}

/**
 * ステートメントを表すASTノード
 */
export type Statement = 
    | AssignmentStatement 
    | OutputStatement 
    | NewlineStatement; // 他のステートメント型も追加予定

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
 * 式を表すASTノード
 */
export type Expression = 
    | NumericLiteral 
    | StringLiteral 
    | Identifier
    | BinaryExpression; // 他の式型も追加予定

/**
 * 数値リテラル
 */
export interface NumericLiteral extends ASTNode {
    type: 'NumericLiteral';
    value: number;
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
