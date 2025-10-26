# インラインIF文をIfBlockStatementに統一する提案の評価

## 提案内容

パース段階で、インラインIF文（`;=条件 ステートメント`）もIfBlockStatementに変換し、
同じ行の残りのステートメントを`thenBody`に入れる。

**例:**
```
;=A>5 ?="yes" ?="confirmed"
```

現在: `[IfStatement, OutputStatement, OutputStatement]`
提案: `[IfBlockStatement { thenBody: [OutputStatement, OutputStatement] }]`

## 修正コストの評価

### 1. パーサーの変更 (低コスト)

**変更箇所:** `src/parser.ts` の `tryProcessIfBlock()` メソッド

**現在のコード (164-187行):**
```typescript
if (parsedStatements.length === 1 && parsedStatements[0]?.type === 'IfStatement') {
    // IfBlockStatementに変換
}
```

**変更後のコード:**
```typescript
// 先頭がIfStatementかチェック
if (parsedStatements.length > 0 && parsedStatements[0]?.type === 'IfStatement') {
    const inlineIf = parsedStatements[0] as any;
    
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
        const endLine = this.collectIfBlock(blockIf, lineNumber + 1);
        const line: Line = {
            lineNumber: lineNumber,
            statements: [blockIf],
            sourceText: sourceText,
        };
        return { line, endLine };
    }
}
```

**推定工数:** 30分〜1時間（実装・テスト含む）

### 2. インタプリタの変更 (中コスト)

**削除可能なコード:**

1. `ExecutionResult.skipRemaining` プロパティ (16行) - 削除
2. `executeIf()` メソッド (87, 401-410行) - 削除
3. `executeStatements()` 内の`skipRemaining`処理 (198-207, 228-230行) - 削除
4. 全ての`skipRemaining: false`の返却（約15箇所） - 簡略化

**推定削除行数:** 約30-40行

**残る変更:**
- `IfStatement`を`statementExecutors`から削除
- `ExecutionResult`インターフェースの簡略化
- 既存の`executeIfBlock()`はそのまま使用可能

**推定工数:** 1-2時間（実装・テスト・リファクタリング含む）

### 3. AST定義の変更 (低コスト)

**変更箇所:** `src/ast.ts`

**現在:**
```typescript
export type Statement = 
    | AssignmentStatement 
    | OutputStatement 
    | NewlineStatement
    | IfStatement        // 削除
    | IfBlockStatement
    ...
```

**変更後:**
```typescript
export type Statement = 
    | AssignmentStatement 
    | OutputStatement 
    | NewlineStatement
    | IfBlockStatement   // IfStatementを削除し、これのみに
    ...
```

`IfStatement`インターフェースも削除可能。

**推定工数:** 15分

### 4. テストの更新 (中コスト)

既存のテストケースがすべてパスすることを確認する必要があります。
特にインラインIF文とブロックIF文の両方をカバーするテストが必要です。

**推定工数:** 1-2時間

## インタプリタのシンプル化の評価

### メリット

1. **制御フローの単純化**
   - `skipRemaining`ロジックが不要になる
   - 行番号による条件分岐（`skipUntilLine`）が不要になる
   - IF文の処理が1つに統一される

2. **コードの可読性向上**
   - IF文は常に`IfBlockStatement`として処理される
   - `executeStatements()`が単純になる（現在は198-230行の複雑なロジック）

3. **保守性の向上**
   - IF文に関するバグの発生源が1箇所に集約される
   - 新しい制御フロー機能を追加する際の複雑度が下がる

4. **実行セマンティクスの明確化**
   - インラインIF文もブロックIF文も同じ実行モデル
   - ASTを見ればどのステートメントが条件分岐に含まれるか明確

### デメリット

1. **パーサーの複雑化（わずか）**
   - `tryProcessIfBlock()`のロジックがやや複雑になる
   - ただし、インタプリタの簡略化により全体としては単純化

2. **AST構造の変更**
   - 既存のツール（デバッガ、解析ツールなど）がある場合は影響を受ける
   - このプロジェクトでは影響なし

3. **行ベースの実行との整合性**
   - 現在は「1ステートメント＝1yield」だが、IfBlockStatementはthenBody内の各ステートメントでyieldする
   - ただし、これは既にブロックIF文で実装済みなので新しい問題ではない

## 総合評価

### 修正コスト
- **総工数:** 3-5時間
- **変更規模:** パーサー +30行、インタプリタ -30行、AST -10行
- **リスク:** 低（既存のブロックIF実装を再利用）

### シンプル化効果
- **コード量:** 純減（約10-20行削除）
- **複雑度:** 大幅に低減
  - `ExecutionResult.skipRemaining`の完全削除
  - 行番号追跡ロジックの削除
  - IF文処理の統一
- **保守性:** 大幅に向上

### 推奨

**実施を強く推奨します。**

理由:
1. 修正コストが低く、効果が高い
2. インタプリタの複雑なロジック（skipRemaining）を完全に削除できる
3. IF文の処理が統一され、将来的なバグの可能性が減る
4. ASTがより意味的に正確になる（後続ステートメントが明示的にthenBodyに含まれる）
5. 実装の一貫性が向上する（インラインもブロックも同じ扱い）

### 実装順序の提案

1. パーサーの変更（tryProcessIfBlock）
2. 既存テストの実行と確認
3. インタプリタの簡略化（skipRemaining削除）
4. AST定義の整理（IfStatement削除）
5. 最終的なテストと確認
