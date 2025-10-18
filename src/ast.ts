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
    | HaltStatement
    | ForStatement
    | NextStatement
    | WhileStatement
    | PokeStatement
    | IoPutStatement;

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
 * GOTOステートメント (例: #=^START)
 * 指定したラベルに無条件ジャンプ
 * WorkerScript仕様: ラベル（^LABEL形式）のみを許容
 */
export interface GotoStatement extends ASTNode {
    type: 'GotoStatement';
    target: string; // ラベル名（^プレフィックスなし）
}

/**
 * GOSUBステートメント (例: !=^MYSUB)
 * 指定したラベルにサブルーチンコール
 * WorkerScript仕様: ラベル（^LABEL形式）のみを許容
 */
export interface GosubStatement extends ASTNode {
    type: 'GosubStatement';
    target: string; // ラベル名（^プレフィックスなし）
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
 * FORループステートメント（統一構文）
 * 例: @=I,1,100 または @=I,100,1,-1
 * ループ変数の初期化と範囲設定
 */
export interface ForStatement extends ASTNode {
    type: 'ForStatement';
    variable: Identifier;    // ループ変数
    start: Expression;       // 開始値
    end: Expression;         // 終了値
    step?: Expression;       // ステップ値（省略時は1）
}

/**
 * NEXTステートメント (例: #=@)
 * FORループの終了処理（統一構造）
 */
export interface NextStatement extends ASTNode {
    type: 'NextStatement';
    variable?: Identifier;    // ループ変数（統一構造 #=@ では省略）
}

/**
 * WHILEループステートメント (例: @=(X<100))
 * 条件式が真の間ループを継続
 */
export interface WhileStatement extends ASTNode {
    type: 'WhileStatement';
    condition: Expression;    // 継続条件
}

/**
 * POKEステートメント (例: `=A)
 * システム変数`を使ってgridDataに値を書き込む
 */
export interface PokeStatement extends ASTNode {
    type: 'PokeStatement';
    value: Expression;       // 書き込む値
}

/**
 * 1byte出力ステートメント (例: $=A)
 * VTL互換：$システム変数を使って1byteの値を出力（0-255）
 */
export interface IoPutStatement extends ASTNode {
    type: 'IoPutStatement';
    value: Expression;       // 出力する値
}

/**
 * 式を表すASTノード
 */
export type Expression = 
    | NumericLiteral 
    | StringLiteral 
    | Identifier
    | BinaryExpression
    | UnaryExpression
    | PeekExpression
    | RandomExpression
    | CharLiteralExpression
    | IoGetExpression;

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
    operator: string; // '+', '-', '*', '/', '%', '>', '<', '>=', '<=', '=', '<>', '&', '|'
    left: Expression;
    right: Expression;
}

/**
 * 単項演算式 (例: -A, -100)
 * 現時点では単項マイナス（-）のみをサポート
 */
export interface UnaryExpression extends ASTNode {
    type: 'UnaryExpression';
    operator: '-' | '+' | '!';  // 単項マイナス、単項プラス、NOT演算子
    operand: Expression;
}

/**
 * PEEK式 (例: A=$)
 * システム変数$を使ってgridDataから値を読み取る
 */
export interface PeekExpression extends ASTNode {
    type: 'PeekExpression';
}

/**
 * Random式 (例: A=~)
 * システム変数~を使ってランダム数を生成（0-32767）
 */
export interface RandomExpression extends ASTNode {
    type: 'RandomExpression';
}

/**
 * Character literal式 (例: A='A')
 * シングルクォートで囲まれた文字をASCIIコードに変換（0-127）
 * エスケープシーケンス対応: '\n', '\t', '\r', '\\', '\'', '\0'
 */
export interface CharLiteralExpression extends ASTNode {
    type: 'CharLiteralExpression';
    value: string; // 実際の文字（エスケープ処理済み）
}

/**
 * 1byte入力式 (例: A=$)
 * VTL互換：$システム変数を使って1byteの値を読み取る（0-255）
 */
export interface IoGetExpression extends ASTNode {
    type: 'IoGetExpression';
}
