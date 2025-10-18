# リファクタリング分析レポート

**作成日**: 2025年10月19日  
**最終更新**: 2025年10月19日  
**開始時**: `src/workerInterpreter.ts` (2670行)  
**現在**: `src/workerInterpreter.ts` (2597行) + `src/ast.ts` (+125行) + `src/memorySpace.ts` (92行)

---

## ✅ 完了したリファクタリング（2025-10-19）

### 1. ✅ executeStatementメソッドの分割
- **完了日**: 2025年10月19日
- **変更**: 280行 → 約50行（15個のメソッドに分離）
- **テスト**: ✅ 全266テスト（1 skipped）PASS

### 2. ✅ evaluateExpressionメソッドの分割
- **完了日**: 2025年10月19日
- **変更**: 160行 → 約30行（10個のメソッドに分離）
- **テスト**: ✅ 全266テスト（1 skipped）PASS

### 3. ✅ MemorySpaceクラスの分離
- **完了日**: 2025年10月19日
- **新規ファイル**: `src/memorySpace.ts` (92行)
- **テスト**: ✅ 全266テスト（1 skipped）PASS

### 4. ✅ 型安全性の向上
- **完了日**: 2025年10月19日
- **新規追加**: 29個のType Guard関数（ast.tsに125行追加）
- **改善**: as型アサーションを全て削除、TypeScript型推論を活用
- **テスト**: ✅ 全266テスト（1 skipped）PASS
- **型チェック**: ✅ エラーなし

**累計成果**:
- workerInterpreter.ts: 2670行 → 2597行（73行削減）
- 新規ファイル: memorySpace.ts (92行), ast.ts (+125行のType Guard)
- コード品質: 大幅改善（単一責任の原則、型安全性、可読性向上）

---

## 📊 現状分析（更新後）

### ファイル構成
- **workerInterpreter.ts**: 2597行（開始時: 2670行）
- **ast.ts**: 466行（Type Guard関数 +125行）
- **memorySpace.ts**: 92行（新規）
- **クラス数**: 2個（WorkerInterpreter, MemorySpace）
- **主要メソッド数**: 約50個（execute*/evaluate*メソッドが追加）
- **最大メソッド**: `buildProgramAST` (約140行), `parsePrimaryExpression` (136行)

### 責務の混在（改善中）
現在の`WorkerInterpreter`クラスは以下の責務を持つ:
1. **字句解析**: Lexerの管理
2. **構文解析**: ASTの構築
3. **意味解析**: 変数スコープ、型チェック ← **型安全性向上済み**
4. **実行**: ステートメントの実行、式の評価 ← **改善済み**
5. **状態管理**: 変数、コールスタック、ループスタック

---

## 🔴 優先度：高（High Priority） - 次のターゲット

### パーサーとインタプリタの分離
- **優先度**: ⭐⭐⭐⭐ (高)
- **難易度**: 🔧🔧🔧🔧 (高)
- **所要時間**: 1-2日
- **行数削減**: 約1000-1200行を別ファイルに移動

**問題点**:
- 単一責任の原則違反
- パーサーとインタプリタが密結合
- テストの粒度が粗い
- パーサーの再利用が困難

**提案**:
```
src/
  parser.ts            # Parser クラス（AST生成）
  interpreter.ts       # Interpreter クラス（AST実行）
  workerInterpreter.ts # 統合クラス（互換性維持）
  memorySpace.ts       # MemorySpace クラス
```

**Parser クラスの責務**:
- スクリプトの字句解析
- ASTの構築
- ラベルの収集
- ブロック構造の検出

**Interpreter クラスの責務**:
- ASTの実行
- 変数の管理
- コールスタックの管理
- ループスタックの管理
- 式の評価

**メリット**:
- 単一責任の原則に従う
- パーサーを他の用途（静的解析、最適化、LSP）に再利用可能
- テストしやすくなる
- コードの見通しが良くなる
- 並行開発が容易

**実装方針**:
1. **Phase 1**: Parser クラスの抽出
   - buildProgramAST関連メソッドを移動
   - parse*メソッドを移動
   - collectBlock関連メソッドを移動
2. **Phase 2**: Interpreter クラスの抽出
   - run()メソッドを移動
   - execute*メソッドを移動
   - evaluate*メソッドを移動
3. **Phase 3**: WorkerInterpreter を統合クラスに変更
   - Parser と Interpreter を保持
   - 既存APIの互換性を維持
4. **Phase 4**: テストの実行と修正

---

## 🟡 優先度：中（Medium Priority）

### 4. ブロック収集ロジックの統合
- **優先度**: ⭐⭐⭐ (中)
- **難易度**: 🔧🔧🔧 (中〜高)
- **所要時間**: 4-6時間

**問題点**:
- `collectIfBlock()` (109行)
- `collectLoopBlock()` (67行)
- 両者は非常に似た構造（再帰的パース、ブロック終端検出）
- コードの重複

**提案**:
```typescript
interface BlockCollectionConfig {
  endCondition: (line: string) => boolean;
  elseCondition?: (line: string) => boolean;
  processNestedBlock: (stmt: Statement, lineIndex: number) => 
    { blockStmt: Statement; endLine: number } | null;
}

private collectBlockBody(
  startLine: number,
  config: BlockCollectionConfig
): { body: Statement[]; elseBody?: Statement[]; endLine: number }
```

### 5. ステートメントパーサーの統一
- **優先度**: ⭐⭐⭐ (中)
- **難易度**: 🔧🔧🔧 (中〜高)
- **所要時間**: 6-8時間

**提案**: Strategy パターンまたは Factory パターンの導入

### 6. parseStatementStringの簡素化
- **優先度**: ⭐⭐⭐ (中)
- **難易度**: 🔧🔧 (中)
- **所要時間**: 3-4時間

---

## 🟢 優先度：低（Low Priority）

### 7. 式パーサーの最適化
- **優先度**: ⭐⭐ (低)
- **難易度**: 🔧🔧🔧🔧 (高)

### 8. 型安全性の向上
- **優先度**: ⭐⭐ (低)
- **難易度**: 🔧🔧🔧 (中〜高)

**提案**:
```typescript
function isIfBlockStatement(stmt: Statement): stmt is IfBlockStatement
function isForBlockStatement(stmt: Statement): stmt is ForBlockStatement
function isAssignmentStatement(stmt: Statement): stmt is AssignmentStatement
```

### 9. MemorySpaceクラスの分離
- **優先度**: ⭐⭐ (低)
- **難易度**: 🔧 (易)
- **所要時間**: 30分

### 10. 定数・マジックナンバーの整理
- **優先度**: ⭐ (最低)
- **難易度**: 🔧 (易)
- **所要時間**: 1時間

---

## 📋 推奨実施順序

### **即座に実施（今日〜明日）**
1. ✅ **executeStatementの分割** (2-3時間)
   - テストを壊さない
   - 実装が簡単
   - 即座に効果が出る

2. ✅ **evaluateExpressionの分割** (2-3時間)
   - テストを壊さない
   - 実装が簡単
   - executeStatementの分割と相乗効果

### **短期（今週中）**
3. **MemorySpaceの分離** (30分)
   - 簡単で効果的
   - 他のリファクタリングの準備

4. **型安全性の向上** (4-6時間)
   - バグ予防
   - 他のリファクタリングの土台

### **中期（来週〜）**
5. **パーサーとインタプリタの分離** (1-2日)
   - 最も大きな効果
   - 他のリファクタリングが完了してから

### **長期（必要に応じて）**
6. **ブロック収集ロジックの統合**
7. **ステートメントパーサーの統一**
8. **式パーサーの最適化**
9. **定数・マジックナンバーの整理**

---

## 🎯 成功基準

### 各リファクタリングの完了条件
- ✅ 全テストがPASS
- ✅ 型エラーがない
- ✅ コードカバレッジが低下していない
- ✅ パフォーマンスが低下していない
- ✅ 既存APIの互換性が保たれている

### 最終目標
- 📉 workerInterpreter.ts を 1000行以下に削減
- 📈 テストカバレッジ 90%以上
- 📚 各クラス・メソッドが単一責任
- 🔧 保守性・拡張性の向上

---

## 📝 注意事項

### リファクタリング時の原則
1. **小さく始める**: 一度に大きな変更をしない
2. **テストを壊さない**: 各ステップでテストを実行
3. **コミットを細かく**: 各リファクタリングごとにコミット
4. **レビューしやすく**: PRを小さく保つ
5. **ドキュメント更新**: コードと同時にドキュメントも更新

### リスク管理
- 大規模な変更（パーサー分離）は慎重に計画
- バックアップブランチを作成
- パフォーマンステストを実施
- 段階的なロールアウト

---

## 📈 期待される効果

### 短期的効果（1-2週間）
- コードの可読性向上
- デバッグしやすくなる
- 新機能追加が容易になる

### 長期的効果（1-2ヶ月）
- 保守コストの削減
- バグの減少
- チーム開発の効率化
- 他プロジェクトへのコード再利用

---

**次のアクション**: executeStatementメソッドの分割から着手
