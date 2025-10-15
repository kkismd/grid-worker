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
export type Statement = AssignmentStatement; // 他のステートメント型も追加予定

/**
 * 代入ステートメント (例: A=10)
 */
export interface AssignmentStatement extends ASTNode {
    type: 'AssignmentStatement';
    variable: Identifier;
    value: Expression;
}

/**
 * 式を表すASTノード
 */
export type Expression = NumericLiteral | Identifier; // 他の式型も追加予定

/**
 * 数値リテラル
 */
export interface NumericLiteral extends ASTNode {
    type: 'NumericLiteral';
    value: number;
}

/**
 * 変数識別子
 */
export interface Identifier extends ASTNode {
    type: 'Identifier';
    name: string;
}
