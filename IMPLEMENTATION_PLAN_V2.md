# WorkerScriptインタプリタ実装計画 V2 (TDDサイクル)

## 改訂理由

**重要な設計上の問題が発見されました：**

1. ラベルジャンプの実装が不可能（行番号からASTを引けない）
2. エラーメッセージに行番号情報がない
3. IFステートメントの実行制御が仕様と異なる

**解決策：行ベースのAST構造に変更**

## 新しいAST構造

```typescript
// 全てのASTノードに行情報を追加
interface ASTNode {
    type: string;
    line: number;      // 必須：ソースコードの行番号
    column?: number;   // オプション：列番号
}

// プログラムは行の配列
interface Program extends ASTNode {
    type: 'Program';
    body: Line[];      // Statement[]ではなくLine[]
}

// 行は複数のステートメントを持つ
interface Line {
    lineNumber: number;
    statements: Statement[];
    sourceText?: string;  // デバッグ用の元のソースコード
}

// IFは条件のみを持つ（consequentは削除）
interface IfStatement extends ASTNode {
    type: 'IfStatement';
    condition: Expression;
    // インタプリタ側で、偽の場合は同じ行の後続ステートメントをスキップ
}
```

## 実装計画

### フェーズ1: 字句解析 (完了済み)

✅ TDDサイクル 1.1-1.3: 字句解析は完了

### フェーズ2A: AST構造のリファクタリング (新規)

#### TDDサイクル 2A.1: ASTノードに行情報を追加

*   **Red (テスト):**
    *   既存のテストを修正し、全てのASTノードに`line`プロパティがあることを期待する。
*   **Green (実装):**
    *   `ast.ts`の全インターフェースを更新し、`ASTNode`に`line: number`を追加。
    *   `workerInterpreter.ts`のパーサーを更新し、トークンの`line`情報をASTノードに伝播。
*   **Refactor (リファクタリング):**
    *   ヘルパー関数を追加して、トークンからASTノードへの変換を簡素化。

#### TDDサイクル 2A.2: Program構造をLine[]に変更

*   **Red (テスト):**
    *   `parse`メソッドが`Line[]`を持つ`Program`を返すことを期待するテスト。
    *   同じ行に複数のステートメントがある場合のテスト（例: `A=10 B=20`）。
*   **Green (実装):**
    *   `ast.ts`に`Line`インターフェースを追加。
    *   `Program.body`を`Statement[]`から`Line[]`に変更。
    *   `parse`メソッドを修正し、ステートメントを`Line`でラップ。
*   **Refactor (リファクタリング):**
    *   `parseLineStatements`ヘルパーメソッドを追加し、1行のトークンから複数のステートメントを解析。

#### TDDサイクル 2A.3: loadScriptでASTを構築・保存

*   **Red (テスト):**
    *   `loadScript`後に`getProgram()`で完全なASTを取得できることを期待するテスト。
    *   ラベルジャンプ先の行を取得できることを期待するテスト。
*   **Green (実装):**
    *   `loadScript`内で全行をパースし、`Program`を構築。
    *   `private program: Program | null`フィールドを追加。
    *   `getLineByNumber(lineNumber: number): Line | undefined`メソッドを実装。
*   **Refactor (リファクタリング):**
    *   エラーハンドリングを改善し、パースエラー時に行番号を含めたメッセージを表示。

### フェーズ2B: ステートメント解析の再実装

#### TDDサイクル 2B.1: 単純な代入・出力ステートメントの再実装

*   **Red (テスト):**
    *   既存のテスト（2.1, 2.2）を新しいLine構造に適合。
*   **Green (実装):**
    *   `parseStatement`メソッドを実装し、個別のステートメントを解析。
    *   全てのステートメントに`line`情報を付与。
*   **Refactor (リファクタリング):**
    *   コードの重複を削減。

#### TDDサイクル 2B.2: 式解析の確認

*   **Red (テスト):**
    *   既存のテスト（2.3, 2.4）を新しい構造で確認。
*   **Green (実装):**
    *   式解析ロジックは変更なし（行情報の追加のみ）。
*   **Refactor (リファクタリング):**
    *   必要に応じて整理。

#### TDDサイクル 2B.3: IFステートメントの再設計 ✅

*   **Red (テスト):**
    *   `;=A>100 ?=100 B=200` が以下の構造になることを期待：
        ```typescript
        {
          lineNumber: 0,
          statements: [
            { type: 'IfStatement', condition: ... },
            { type: 'OutputStatement', ... },
            { type: 'AssignmentStatement', ... }
          ]
        }
        ```
    *   IFが単独のステートメントとして解析されることを確認。
*   **Green (実装):**
    *   `IfStatement`から`consequent`を削除。
    *   `parseIfStatement`を簡素化し、条件式のみを解析。
    *   後続のステートメントは別の独立したステートメントとして解析。
*   **Refactor (リファクタリング):**
    *   `parseIfStatement`の複雑なロジックを削除し、シンプルに。

#### TDDサイクル 2B.3.5: 単項マイナス演算子と負の数リテラル

*   **Red (テスト):**
    *   負の数リテラル (`-100`) が正しく解析されることを期待するテスト。
    *   単項マイナスを含む代入 (`A=-B`) が正しく解析されることを期待するテスト。
    *   複雑な式での単項マイナス (`C=10+-5`) が正しく解析されることを期待するテスト。
    *   単項マイナスが二項マイナスと区別されることを確認するテスト。
*   **Green (実装):**
    *   `ast.ts`に`UnaryExpression`インターフェースを追加。
    *   `parsePrimaryExpression`に単項マイナスの解析ロジックを実装。
    *   数値の型を16bit符号付き整数(-32768~32767)として明確化。
    *   HALTステートメント（`#=-1`）検出は現状維持（パターンマッチング）。
*   **Refactor (リファクタリング):**
    *   単項演算子解析の拡張可能性を考慮した設計に整理。
    *   式解析の可読性向上。

#### TDDサイクル 2B.4: GOTO/GOSUB/RETURN/HALTステートメントの解析 ⚠️ (要修正)

*   **Red (テスト):**
    *   `#=^START` (GOTO) が正しく解析されることを期待するテスト。**ラベルのみ許容**
    *   `!=^MYSUB` (GOSUB) が正しく解析されることを期待するテスト。**ラベルのみ許容**
    *   `]` (RETURN) が正しく解析されることを期待するテスト。
    *   `#=-1` (HALT) が正しく解析されることを期待するテスト。
    *   数値・変数・式をターゲットとした場合はエラーになることを確認するテスト。
*   **Green (実装):**
    *   `GotoStatement`, `GosubStatement`, `ReturnStatement`, `HaltStatement`を`ast.ts`に追加。
    *   `GotoStatement.target`と`GosubStatement.target`は`string`型（ラベル名、^なし）。
    *   パーサーは`#=^LABEL`パターンのみを受け入れる（数値・変数・式は構文エラー）。
    *   `#=-1`は特殊ケースとしてHALTステートメントに変換。
*   **Refactor (リファクタリング):**
    *   制御フロー系ステートメントの解析を整理。

**注意:** 初期実装では誤って式を許容していたため、修正が必要。
WorkerScriptの仕様では、GOTO/GOSUBはラベル（`^LABEL`形式）のみを受け入れる。
VTL2では行番号を使用していたが、WorkerScriptではラベルベースの制御フローに変更されている。

#### TDDサイクル 2B.5: FORループ・NEXTの解析

*   **Red (テスト):**
    *   `I=1,100` (FOR初期化) が正しく解析されることを期待するテスト。
    *   `@=I` (NEXT) が正しく解析されることを期待するテスト。
*   **Green (実装):**
    *   `ForStatement`, `NextStatement`を`ast.ts`に追加。
    *   パーサーに対応するロジックを実装。
*   **Refactor (リファクタリング):**
    *   ループ関連の解析を整理。

#### TDDサイクル 2B.6: PEEK/POKEの解析

*   **Red (テスト):**
    *   `A=*` (PEEK) が正しく解析されることを期待するテスト。
    *   `*=C` (POKE) が正しく解析されることを期待するテスト。
*   **Green (実装):**
    *   `PeekExpression`, `PokeStatement`を`ast.ts`に追加。
    *   パーサーに対応するロジックを実装。
*   **Refactor (リファクタリング):**
    *   メモリアクセス関連を整理。

#### TDDサイクル 2B.7: 複数ステートメント行の統合テスト

*   **Red (テスト):**
    *   `A=10 B=20 ?=A+B` のような複数ステートメントが1つの`Line`に正しく解析される。
    *   `;=A>10 ?="Yes" B=1` のようなIF+後続ステートメントが正しく解析される。
*   **Green (実装):**
    *   `parseLineStatements`が複数のステートメントを正しく分離。
*   **Refactor (リファクタリング):**
    *   必要に応じて整理。

### フェーズ3: 実行 (Interpretation)

*   フェーズ2B完了後に詳細計画を立てる。
*   行ベースのASTにより、ラベルジャンプ・行スキップが実装可能になる。

## マイルストーン

- [x] フェーズ1完了：字句解析 (TDDサイクル 1.1-1.3)
- [x] フェーズ2A完了：行ベースAST構造への移行 (TDDサイクル 2A.1-2A.3)
- [ ] フェーズ2B完了：全ステートメントの再実装
  - [x] 2B.1: 単純な代入・出力ステートメントの再実装
  - [x] 2B.2: 式解析の確認
  - [x] 2B.3: IFステートメントの再設計
  - [x] 2B.3.5: 単項マイナス演算子と負の数リテラル
  - [x] 2B.4: GOTO/GOSUB/RETURN/HALTステートメントの解析（修正完了：ラベルのみ許容）
  - [x] 2B.5: FORループ・NEXTの解析
  - [x] 2B.6: PEEK/POKEの解析 ← **完了**
  - [ ] 2B.7: 複数ステートメント行の統合テスト ← **次のステップ**
- [ ] フェーズ3開始：インタプリタ実装

## 現在の進捗

**完了:** TDDサイクル 2B.6（PEEK/POKE解析）  
**次のステップ:** TDDサイクル 2B.7（複数ステートメント行の統合テスト）

### 重要な修正事項

**TDDサイクル 2B.4の仕様違反を修正完了:**
- 初期実装では誤ってGOTO/GOSUBが数値・変数・式を許容していた
- WorkerScript仕様では **ラベル（`^LABEL`形式）のみ** を受け入れる
- VTL2では行番号を使用していたが、WorkerScriptではラベルベース
- AST定義と実装を修正完了

**TDDサイクル 2B.3.5の追加:**
- FOR/NEXTループ（2B.5）で負のステップ値（`I=100,1,-1`）が必要
- 単項マイナス演算子のサポートを完了

