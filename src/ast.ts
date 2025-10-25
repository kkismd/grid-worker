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
    | IfBlockStatement
    | GotoStatement
    | GosubStatement
    | ReturnStatement
    | HaltStatement
    | ForStatement
    | ForBlockStatement
    | NextStatement
    | WhileStatement
    | WhileBlockStatement
    | PokeStatement
    | IoPutStatement
    | ArrayAssignmentStatement
    | ArrayInitializationStatement;

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
 * IFブロックステートメント (例: ;=A>100 ... #=;)
 * ブロック構造のIF文：条件が真の場合thenBodyを実行、偽の場合elseBodyを実行（あれば）
 * インラインIF文（;=A>100 ?="yes"）も同じ構造で表現される。
 */
export interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];      // THEN部のステートメント
    elseBody?: Statement[];     // ELSE部のステートメント（オプション）
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
 * FORループブロックステートメント（統一構文・ブロック構造）
 * 例: @=I,1,100 ... #=@
 * ループボディを明示的に保持するブロック構造
 */
export interface ForBlockStatement extends ASTNode {
    type: 'ForBlockStatement';
    variable: Identifier;    // ループ変数
    start: Expression;       // 開始値
    end: Expression;         // 終了値
    step?: Expression;       // ステップ値（省略時は1）
    body: Statement[];       // ループボディ
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
 * WHILEループブロックステートメント（統一構文・ブロック構造）
 * 例: @=(X<100) ... #=@
 * ループボディを明示的に保持するブロック構造
 */
export interface WhileBlockStatement extends ASTNode {
    type: 'WhileBlockStatement';
    condition: Expression;    // 継続条件
    body: Statement[];        // ループボディ
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
    | IoGetExpression
    | InputNumberExpression
    | ArrayAccessExpression;

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

/**
 * 数値入力式 (例: A=?)
 * ユーザーから1行の入力を受け取り、数値に変換する
 * C言語の fgets() + atoi() に相当
 */
export interface InputNumberExpression extends ASTNode {
    type: 'InputNumberExpression';
}

// ==================== 配列・スタック機能 ====================

/**
 * 配列アクセス式 (例: [A], [A+5], [1000])
 * メモリ空間（65536要素）へのアクセスを表現
 * 特殊: [-1] はスタックポップ（リテラルの場合のみ）
 */
export interface ArrayAccessExpression extends ASTNode {
    type: 'ArrayAccessExpression';
    index: Expression;      // インデックス式（変数、リテラル、計算式など）
    isLiteral?: boolean;    // インデックスがリテラルかどうか（-1のスタック判定用）
}

/**
 * 配列代入ステートメント (例: [A]=100, [A+5]=B)
 * メモリ空間への単一値の書き込みを表現
 * 特殊: [-1]=A はスタックプッシュ（リテラルの場合のみ）
 */
export interface ArrayAssignmentStatement extends ASTNode {
    type: 'ArrayAssignmentStatement';
    index: Expression;      // インデックス式
    value: Expression;      // 書き込む値
    isLiteral?: boolean;    // インデックスがリテラルかどうか（-1のスタック判定用）
}

/**
 * 配列初期化ステートメント (例: [A]=1,2,3,4,5)
 * メモリ空間への複数値の連続書き込みを表現
 * [startIndex] から順に values を書き込む
 */
export interface ArrayInitializationStatement extends ASTNode {
    type: 'ArrayInitializationStatement';
    index: Expression;      // 開始インデックス式
    values: Expression[];   // 書き込む値の配列
}

// ============================================================================
// Type Guard Functions
// ============================================================================

/**
 * 型ガード関数を生成するファクトリー関数
 * 同一パターンの型ガード関数を効率的に作成します
 */
function createTypeGuard<T extends { type: string }>(
    typeName: string
): (obj: { type: string }) => obj is T {
    return (obj: { type: string }): obj is T => obj.type === typeName;
}

/**
 * Statement型のType Guard関数群
 * TypeScriptの型推論を活用し、型安全なコードを実現します。
 */

export const isAssignmentStatement = createTypeGuard<AssignmentStatement>('AssignmentStatement');
export const isOutputStatement = createTypeGuard<OutputStatement>('OutputStatement');
export const isNewlineStatement = createTypeGuard<NewlineStatement>('NewlineStatement');
export const isIfStatement = createTypeGuard<IfStatement>('IfStatement');
export const isIfBlockStatement = createTypeGuard<IfBlockStatement>('IfBlockStatement');
export const isGotoStatement = createTypeGuard<GotoStatement>('GotoStatement');
export const isGosubStatement = createTypeGuard<GosubStatement>('GosubStatement');
export const isReturnStatement = createTypeGuard<ReturnStatement>('ReturnStatement');
export const isHaltStatement = createTypeGuard<HaltStatement>('HaltStatement');
export const isForStatement = createTypeGuard<ForStatement>('ForStatement');
export const isForBlockStatement = createTypeGuard<ForBlockStatement>('ForBlockStatement');
export const isNextStatement = createTypeGuard<NextStatement>('NextStatement');
export const isWhileStatement = createTypeGuard<WhileStatement>('WhileStatement');
export const isWhileBlockStatement = createTypeGuard<WhileBlockStatement>('WhileBlockStatement');
export const isPokeStatement = createTypeGuard<PokeStatement>('PokeStatement');
export const isIoPutStatement = createTypeGuard<IoPutStatement>('IoPutStatement');
export const isArrayAssignmentStatement = createTypeGuard<ArrayAssignmentStatement>('ArrayAssignmentStatement');
export const isArrayInitializationStatement = createTypeGuard<ArrayInitializationStatement>('ArrayInitializationStatement');

/**
 * Expression型のType Guard関数群
 */

export const isNumericLiteral = createTypeGuard<NumericLiteral>('NumericLiteral');
export const isStringLiteral = createTypeGuard<StringLiteral>('StringLiteral');
export const isIdentifier = createTypeGuard<Identifier>('Identifier');
export const isUnaryExpression = createTypeGuard<UnaryExpression>('UnaryExpression');
export const isBinaryExpression = createTypeGuard<BinaryExpression>('BinaryExpression');
export const isPeekExpression = createTypeGuard<PeekExpression>('PeekExpression');
export const isRandomExpression = createTypeGuard<RandomExpression>('RandomExpression');
export const isCharLiteralExpression = createTypeGuard<CharLiteralExpression>('CharLiteralExpression');
export const isIoGetExpression = createTypeGuard<IoGetExpression>('IoGetExpression');
export const isInputNumberExpression = createTypeGuard<InputNumberExpression>('InputNumberExpression');
export const isArrayAccessExpression = createTypeGuard<ArrayAccessExpression>('ArrayAccessExpression');

