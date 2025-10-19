# ループ構造AST改善の変更コスト見積もり

## 📋 現状分析

### 現在のAST構造
```typescript
// FOR文
export interface ForStatement extends ASTNode {
    type: 'ForStatement';
    variable: Identifier;
    start: Expression;
    end: Expression;
    step?: Expression;
}

// WHILE文
export interface WhileStatement extends ASTNode {
    type: 'WhileStatement';
    condition: Expression;
}

// 終端（FOR/WHILE共通）
export interface NextStatement extends ASTNode {
    type: 'NextStatement';
    variable?: Identifier;
}
```

### 現在の実行フロー
1. **開始ステートメント実行** (`@=I,1,10` または `@=(X<100)`)
   - ループ情報を`loopStack`にpush
   - 初期条件チェック（失敗時は`findMatchingNext()`で`#=@`を検索してスキップ）

2. **ループボディ実行** (行ベースで順次実行)
   - `executeStatement()`が各行のステートメントを処理
   - ループボディは明示的に保持せず、行番号の範囲として暗黙的に実行

3. **終端ステートメント実行** (`#=@`)
   - ループ変数を更新（FORの場合）
   - 条件を再評価（WHILEの場合）
   - 継続判定：`currentLineIndex = forLineIndex + 1` でジャンプ
   - 終了判定：`loopStack.pop()`

### 問題点
1. **ループボディが暗黙的** - 行番号の範囲として扱われ、ASTに明示的に含まれていない
2. **`findMatchingNext()`の複雑さ** - ネストレベルを追跡して対応する`#=@`を探す（O(n)）
3. **実行時の行番号依存** - `currentLineIndex`を直接操作してジャンプ
4. **IF-FIとの不整合** - `IfBlockStatement`はthenBody/elseBodyを持つが、ループは持たない

---

## 🎯 提案する新しいAST構造

### ブロック構造化されたループAST
```typescript
// FOR文ブロック
export interface ForBlockStatement extends ASTNode {
    type: 'ForBlockStatement';
    variable: Identifier;
    start: Expression;
    end: Expression;
    step?: Expression;
    body: Statement[];  // ループボディを明示的に保持
}

// WHILE文ブロック
export interface WhileBlockStatement extends ASTNode {
    type: 'WhileBlockStatement';
    condition: Expression;
    body: Statement[];  // ループボディを明示的に保持
}

// NextStatement は不要（ボディの終端マーカーとしてのみパース時に使用）
```

### 統一ループ処理
```typescript
// 共通のループ実行ロジック
private executeLoopBlock(
    initFn: () => boolean,  // 初期化と初回条件チェック
    updateFn: () => void,   // ループ変数更新（FORのみ）
    conditionFn: () => boolean,  // 継続条件
    body: Statement[]
): ExecutionResult {
    // 初期化
    if (!initFn()) {
        return { jump: false, halt: false, skipRemaining: false };
    }
    
    // ループ実行
    while (conditionFn()) {
        for (const stmt of body) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
        updateFn();
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

---

## 📊 変更コスト見積もり

### 1. AST定義変更 (1-2時間)
**ファイル**: `src/ast.ts`

**作業内容**:
- [ ] `ForBlockStatement` インターフェース追加（`body: Statement[]`を含む）
- [ ] `WhileBlockStatement` インターフェース追加（`body: Statement[]`を含む）
- [ ] `Statement` union型に新しい型を追加
- [ ] 古い`ForStatement`/`WhileStatement`を削除するか、後方互換性のため残す
- [ ] `NextStatement`を削除（パース時のマーカーとしてのみ使用）

**複雑度**: 低
**リスク**: 低（型定義のみ）

---

### 2. パーサー変更 (3-4時間)
**ファイル**: `src/workerInterpreter.ts`

**作業内容**:
- [ ] `collectLoopBlock()` メソッド追加（`collectIfBlock()`と同様）
  ```typescript
  private collectLoopBlock(startLine: number): { body: Statement[], endLine: number } {
      const body: Statement[] = [];
      for (let i = startLine; i < this.scriptLines.length; i++) {
          if (isNextStatement(line)) {
              return { body, endLine: i };
          }
          // ステートメントをパースしてbodyに追加
      }
      throw new Error('ループに対応する #=@ が見つかりません');
  }
  ```

- [ ] `buildProgramAST()` 修正
  - `@=I,1,10` を検出したら`collectLoopBlock()`を呼び出し
  - `ForBlockStatement`または`WhileBlockStatement`を生成
  - `endLine`までスキップ（IF-FIと同じパターン）

- [ ] ネストされたループの処理
  - `collectLoopBlock()`内でネストレベルを追跡
  - 対応する`#=@`を正しく見つける

**複雑度**: 中
**リスク**: 中（ネスト処理が複雑）

**既存コードとの類似性**:
- `collectIfBlock()`の実装をほぼそのまま流用可能
- `;` → `#=@` の検出
- `#=;` → `#=@` の検出

---

### 3. インタープリター変更 (4-5時間)
**ファイル**: `src/workerInterpreter.ts`

**作業内容**:
- [ ] `executeForBlockStatement()` 実装
  ```typescript
  private executeForBlockStatement(statement: ForBlockStatement): ExecutionResult {
      const varName = statement.variable.name;
      const startValue = this.evaluateExpression(statement.start);
      const endValue = this.evaluateExpression(statement.end);
      const stepValue = statement.step ? this.evaluateExpression(statement.step) : 1;
      
      // 初期化
      this.variables.set(varName, startValue);
      
      // ループ実行
      let current = startValue;
      while ((stepValue > 0 ? current <= endValue : current >= endValue)) {
          // bodyを実行
          for (const stmt of statement.body) {
              const result = this.executeStatement(stmt);
              if (result.jump || result.halt) return result;
          }
          // 更新
          current += stepValue;
          this.variables.set(varName, current);
      }
      
      return { jump: false, halt: false, skipRemaining: false };
  }
  ```

- [ ] `executeWhileBlockStatement()` 実装
  ```typescript
  private executeWhileBlockStatement(statement: WhileBlockStatement): ExecutionResult {
      // 条件評価
      while (this.evaluateExpression(statement.condition) !== 0) {
          // bodyを実行
          for (const stmt of statement.body) {
              const result = this.executeStatement(stmt);
              if (result.jump || result.halt) return result;
          }
      }
      
      return { jump: false, halt: false, skipRemaining: false };
  }
  ```

- [ ] `executeStatement()` のswitch文に新しいケース追加
  ```typescript
  case 'ForBlockStatement':
      return this.executeForBlockStatement(statement);
  
  case 'WhileBlockStatement':
      return this.executeWhileBlockStatement(statement);
  ```

- [ ] 古い実装の削除
  - `executeForStatement()` 削除
  - `executeWhileStatement()` 削除
  - `executeNextStatement()` 削除
  - `findMatchingNext()` 削除
  - `loopStack` 削除（不要になる）

**複雑度**: 中
**リスク**: 中（実行ロジックの変更）

**メリット**:
- 行番号ベースのジャンプが不要
- `loopStack`の管理が不要
- `findMatchingNext()`の複雑なネスト追跡が不要
- コードが大幅に簡潔になる（約200行 → 約80行）

---

### 4. テスト修正 (2-3時間)
**ファイル**: `src/__tests__/workerInterpreter.test.ts`, `src/__tests__/arrayStackDemos.test.ts`

**作業内容**:
- [ ] 既存のループテストがすべて通ることを確認
- [ ] 新しいブロック構造のテストケース追加（必要に応じて）
- [ ] ネストされたループのテスト確認
- [ ] エラーケースのテスト（`#=@`なし、ネスト深度超過など）

**複雑度**: 低
**リスク**: 低（既存テストは265個すべて通る必要がある）

---

### 5. ドキュメント更新 (1時間)
**ファイル**: `worker.md`, `README.md`, `IF_BLOCK_DESIGN.md`

**作業内容**:
- [ ] ループのAST構造変更を記載
- [ ] 実装の簡素化について説明
- [ ] サンプルコードは変更不要（構文は同じ）

**複雑度**: 低
**リスク**: 低

---

## 📈 総作業時間見積もり

| 項目 | 時間 | 複雑度 | リスク |
|------|------|--------|--------|
| AST定義変更 | 1-2時間 | 低 | 低 |
| パーサー変更 | 3-4時間 | 中 | 中 |
| インタープリター変更 | 4-5時間 | 中 | 中 |
| テスト修正 | 2-3時間 | 低 | 低 |
| ドキュメント更新 | 1時間 | 低 | 低 |
| **合計** | **11-15時間** | **中** | **中** |

---

## ✅ メリット

### コードの簡潔化
- **削除できるコード**: 約150-200行
  - `loopStack`管理ロジック
  - `findMatchingNext()`（約50行）
  - `executeForStatement()`の複雑な条件分岐
  - `executeWhileStatement()`の条件分岐
  - `executeNextStatement()`の分岐処理

- **追加するコード**: 約100行
  - `collectLoopBlock()`（約50行、`collectIfBlock()`の流用）
  - `executeForBlockStatement()`（約30行、シンプル）
  - `executeWhileBlockStatement()`（約20行、シンプル）

- **純減**: 約50-100行

### 一貫性の向上
- IF-FIブロック構造と統一された設計
- すべてのブロック構造が`body: Statement[]`を持つ
- 統一構文パターン（`@=.../[=;` と `#=@/#=;`）の内部実装も統一

### パフォーマンス向上
- `findMatchingNext()`のO(n)検索が不要
- 行番号ベースのジャンプが不要
- ループ実行が直接的で高速

### 保守性の向上
- ネスト管理が不要（ASTツリー構造で自然に表現）
- エラーハンドリングが簡潔
- デバッグが容易（ASTを見ればループボディが一目瞭然）

---

## ⚠️ リスク

### 中程度のリスク
1. **パース時のネスト処理**
   - `collectLoopBlock()`内でネストされた`@=...#=@`を正しく処理する必要
   - `collectIfBlock()`と同じパターンで実装可能

2. **GOTO/GOSUBとの相互作用**
   - ループ内からGOTO/GOSUBした場合の挙動
   - 現在の実装でも`loopStack`を適切にクリアしていないため、新実装でも同様の問題がある可能性
   - この点は既存の問題で、新実装で悪化はしない

3. **既存テストの互換性**
   - 265個のテストすべてが通る必要がある
   - 特にループのネストテスト、エラーケーステストに注意

### 低リスク
- 構文は変更しないため、ユーザーコードは影響を受けない
- AST構造の変更のみなので、段階的に実装可能

---

## 🔄 FOR/WHILE処理の共通化の可能性

### 共通部分
- ループボディの実行ロジック
- ネストレベルの管理（パース時）
- エラーハンドリング

### 差異
- **FOR**: 初期化、終了条件、ステップ更新
- **WHILE**: 条件評価のみ

### 共通化の実装例
```typescript
private executeLoopBlock(
    type: 'for' | 'while',
    initFn: () => boolean,
    updateFn: () => void,
    conditionFn: () => boolean,
    body: Statement[]
): ExecutionResult {
    if (!initFn()) return { jump: false, halt: false, skipRemaining: false };
    
    while (conditionFn()) {
        for (const stmt of body) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
        updateFn();
    }
    
    return { jump: false, halt: false, skipRemaining: false };
}
```

**削減効果**: さらに約20-30行削減可能
**複雑度**: 共通化により多少複雑になる可能性もあるが、重複コードは削減される

---

## 📝 推奨実装順序

### Phase 1: AST定義 (1-2時間)
1. 新しいAST型を定義（`ForBlockStatement`, `WhileBlockStatement`）
2. 既存の型は残す（後方互換性のため）

### Phase 2: パーサー実装 (3-4時間)
1. `collectLoopBlock()` 実装
2. `buildProgramAST()`修正（IF-FI検出と同様のパターン）
3. ネスト処理のテスト

### Phase 3: インタープリター実装 (4-5時間)
1. `executeForBlockStatement()` 実装
2. `executeWhileBlockStatement()` 実装
3. 古い実装を段階的に削除
4. テストを随時実行して確認

### Phase 4: テストとクリーンアップ (2-3時間)
1. 全テスト実行（265個すべて通ることを確認）
2. 古いコード削除（`loopStack`, `findMatchingNext()`など）
3. ドキュメント更新

### Phase 5: 最適化（オプション）(1-2時間)
1. FOR/WHILE処理の共通化
2. パフォーマンステスト

---

## 🎯 結論

### 変更コスト: **11-15時間**（中程度）

### メリット
- コードの簡潔化（50-100行削減）
- IF-FIとの一貫性
- パフォーマンス向上
- 保守性の大幅な向上

### リスク: **中程度**
- パース時のネスト処理が主なリスク
- 既存テストの互換性確保が必須
- 段階的実装で軽減可能

### 推奨度: **高い 👍**
- IF-FIブロック構造と統一される設計的メリットが大きい
- コードが大幅に簡潔になる
- 今後の拡張（BREAK/CONTINUEなど）がしやすくなる
- 変更コストは中程度だが、得られるメリットが大きい

**総合評価**: IF-FIブロック構造の実装が完了した今、ループ構造も同様にブロック化することで、言語全体の一貫性が向上します。変更コストは15時間程度と見積もられますが、コードの品質向上とメンテナンス性の改善を考えると、**実施する価値が高い**と判断します。
