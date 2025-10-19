# コード品質管理ドキュメント

## 概要

このドキュメントは、プロジェクトのコード品質状況を記録し、今後の改善計画を管理します。

## ESLint警告の現状（2025年10月19日時点）

### 統計サマリー

```
総警告数: 88件
エラー数: 0件
```

すべてのコードは正常に動作しており、警告はコード品質の改善提案で| 優先度 | 件数 | 種別 | 対応 |
|--------|------|------|------|
| 🟢 緑（許容） | 45件 | 複雑度、ステートメント数、行数、ネスト深度 | 言語実装の性質上必要 |
| 🟡 黄（検討） | 43件 | `any`型使用 | インタプリタの性質上適切 |
| ✅ 完了 | 0件 | 未使用変数・インポート | クリーンアップ完了 |

**内訳詳細**:
- 複雑度（complexity）: 15件
- ステートメント数（max-statements）: 14件
- 行数（max-lines-per-function）: 5件
- ネスト深度（max-depth）: 13件（lexer.ts: 4件、workerInterpreter.ts: 9件）
- any型（no-explicit-any）: 41件（43件から2件減）
- 未使用変数（no-unused-vars）: 0件 ✅

**合計**: 88件（107件から19件削減、17.8%改善） 初回作成時: 107件
- クリーンアップ第1段階（2025-10-19）: 101件（未使用変数6件削除）
- クリーンアップ第2段階（2025-10-19）: 88件（未使用変数13件削除）
- **累計削減**: 19件（17.8%改善）

### 警告の分類

#### 1. 複雑度警告（Complexity）

**影響ファイル**: 主にパーサーとインタプリタ

| ファイル | 関数 | 複雑度 | 制限 | 理由 |
|---------|------|--------|------|------|
| `parser.ts` | `tokenizeLine` | 60 | 15 | レキサーの状態機械、複雑な文字列/コメント処理 |
| `parser.ts` | `parseStatementFromTokens` | 24 | 15 | 多数のステートメント種別を処理 |
| `parser.ts` | `parseStatementString` | 28 | 15 | 文字列ベースのパース処理 |
| `parser.ts` | `parsePrimaryExpression` | 27 | 15 | 多様な式の種別を処理 |
| `parser.ts` | `parseArrayStatement` | 23 | 15 | 配列構文の複雑な解析 |
| `parser.ts` | `collectIfBlock` | 17 | 15 | ブロック構造の収集 |
| `parser.ts` | `splitLineByWhitespace` | 17 | 15 | トークン分割の複雑な処理 |
| `workerInterpreter.ts` | `run` | 31 | 15 | メインループ、多様な実行フロー |
| `workerInterpreter.ts` | `executeStatement` | 19 | 15 | 多数のステートメント種別の分岐 |
| `workerInterpreter.ts` | `evaluateBinaryExpression` | 28 | 15 | 多数の演算子を処理 |
| `cli.ts` | `parseArgs` | 46 | 15 | 多数のCLIオプションを処理 |
| `cli.ts` | `main` | 23 | 15 | 実行モードの多様な分岐 |
| `cliRunner.ts` | `executeScript` | 18 | 15 | スクリプト実行の多様な処理 |
| `RealTimeCLIRunner.ts` | `executeRealTime` | 17 | 15 | リアルタイム実行の複雑な初期化 |
| `index.ts` | (無名アロー関数) | 16 | 15 | 行560: イベントハンドラの分岐 |

**評価**: 
- これらの関数は言語実装の中核であり、本質的に複雑
- 機能を分割すると可読性が低下する可能性がある
- 現状のコードは適切にコメントされており、理解可能

**対応方針**: 
- 🟢 **現状維持**: 機能的に必要な複雑度
- 🟡 **将来的改善**: サブコマンド実装時に`cli.ts`の`parseArgs`をリファクタリング

#### 2. ステートメント数警告（Max Statements）

**影響ファイル**: 同上

| ファイル | 関数 | ステートメント数 | 制限 | 備考 |
|---------|------|-----------------|------|------|
| `parser.ts` | `tokenizeLine` | 192 | 30 | 複雑度と連動 |
| `parser.ts` | `parseStatementFromTokens` | 54 | 30 | 複雑度と連動 |
| `parser.ts` | `parseStatementString` | 52 | 30 | 複雑度と連動 |
| `parser.ts` | `parsePrimaryExpression` | 45 | 30 | 複雑度と連動 |
| `parser.ts` | `collectIfBlock` | 47 | 30 | 複雑度と連動 |
| `parser.ts` | `parseArrayStatement` | 43 | 30 | 複雑度と連動 |
| `parser.ts` | `splitLineByWhitespace` | 46 | 30 | 複雑度と連動 |
| `workerInterpreter.ts` | `run` | 72 | 30 | 複雑度と連動 |
| `cli.ts` | `main` | 35 | 30 | 複雑度と連動 |
| `cliRunner.ts` | `executeScript` | 31 | 30 | 複雑度と連動 |
| `RealTimeCLIRunner.ts` | `executeRealTime` | 43 | 30 | 複雑度と連動 |
| `RealTimeCLIRunner.ts` | `runFrameLoop` | 36 | 30 | フレームループの処理 |

**評価**: 複雑度警告と同じ関数で発生

**対応方針**: 🟢 **現状維持**

#### 3. 行数警告（Max Lines Per Function）

**影響ファイル**: 同上

| ファイル | 関数 | 行数 | 制限 | 備考 |
|---------|------|------|------|------|
| `parser.ts` | `tokenizeLine` | 257 | 100 | レキサーの実装 |
| `parser.ts` | `parseStatementFromTokens` | 144 | 100 | ステートメント解析 |
| `parser.ts` | `parseStatementString` | 101 | 100 | 文字列ベースパース |
| `parser.ts` | `parsePrimaryExpression` | 104 | 100 | 式の解析 |
| `cli.ts` | `parseArgs` | 114 | 100 | CLIオプション処理 |

**評価**: 複雑度警告と同じ関数で発生

**対応方針**: 🟢 **現状維持**、🟡 **`parseArgs`は将来改善**

#### 4. ネスト深度警告（Max Depth）

**影響ファイル**: `lexer.ts`, `workerInterpreter.ts`

| ファイル | 行 | 深度 | 制限 | 理由 |
|---------|-----|------|------|------|
| `lexer.ts` | 106-108 | 5-6 | 4 | 文字列処理の状態機械 |
| `lexer.ts` | 116 | 5 | 4 | 16進数リテラル処理 |
| `lexer.ts` | 161 | 5 | 4 | トークン生成ロジック |
| `workerInterpreter.ts` | 216 | 5 | 4 | FORループのネスト処理 |
| `workerInterpreter.ts` | 223 | 6 | 4 | FORループのネスト処理 |
| `workerInterpreter.ts` | 226 | 7 | 4 | FORループのネスト処理 |
| `workerInterpreter.ts` | 227 | 8 | 4 | FORループのネスト処理（最深） |
| `workerInterpreter.ts` | 243 | 5 | 4 | WHILEループのネスト処理 |
| `workerInterpreter.ts` | 247 | 5 | 4 | WHILEループのネスト処理 |
| `workerInterpreter.ts` | 252 | 6 | 4 | WHILEループのネスト処理 |
| `workerInterpreter.ts` | 255 | 7 | 4 | WHILEループのネスト処理 |
| `workerInterpreter.ts` | 256 | 8 | 4 | WHILEループのネスト処理（最深） |

**評価**: 
- レキサーとループ実装で構造的に必要な深度
- アルゴリズムの性質上、避けがたい

**対応方針**: 🟢 **現状維持**

#### 5. 型指定警告（@typescript-eslint/no-explicit-any）

**影響ファイル**: 全ファイル

| ファイル | 件数 | 理由 |
|---------|------|------|
| `parser.ts` | 14 | AST構造が動的 |
| `workerInterpreter.ts` | 27 | ステートメント・式の型が実行時に決定 |
| `cliRunner.ts` | 2 | コールバック関数の柔軟性 |
| `RealTimeCLIRunner.ts` | 3 | コールバック関数の柔軟性 |
| `index.ts` | 2 | DOM操作の柔軟性 |

**合計**: 43件 (48件)

**評価**: 
- インタプリタの動的な性質上、`any`型の使用は適切
- AST構造は実行時に型が決定される

**対応方針**: 🟢 **現状維持**（インタプリタの性質上必要）

#### 6. 未使用変数警告（@typescript-eslint/no-unused-vars）

**影響ファイル**: 複数（13件）

| ファイル | 変数 | 理由 | 対応 |
|---------|------|------|------|
| `workerInterpreter.ts` | `Identifier`, `NumericLiteral`, `StringLiteral` | 型インポート（型アノテーションで使用中） | � 保持 |
| `workerInterpreter.ts` | `WhileStatement` | 型インポート | � 使用されていない可能性 |
| `workerInterpreter.ts` | `isForStatement`等（6関数） | 型ガード関数（インポートのみ） | � 削除または使用 |
| `workerInterpreter.ts` | `InterpreterState` | インターフェース定義（未使用） | 🔴 削除可能 |
| `index.ts` | `e` (keyupイベント) | イベント引数 | 🟡 `_e`にリネーム |
| `CharacterVRAMRenderer.ts` | `currentFrame` | 未使用の引数 | 🟡 `_currentFrame`にリネーム |

**削除済み変数（2025-10-19クリーンアップ）**:
- ✅ `index.ts`: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `currentKeyCode`
- ✅ `lexer.ts`: `isHex`
- ✅ `workerInterpreter.ts`: `TokenType`
- ✅ `RealTimeCLIRunner.ts`: `frameSteps`

**評価**: 
- 型インポート（`Identifier`等）は型アノテーションで実際に使用されている
- 型ガード関数は将来使用する可能性がある
- `InterpreterState`は真に未使用

**対応方針**: � **要検討**（優先度：低）

#### 7. その他の警告

- **警告なし**: 新規実装コード（配列機能、トランスクリプト出力）はクリーン ✅

### 警告の優先度別サマリー

| 優先度 | 件数 | 種別 | 対応 |
|--------|------|------|------|
| 🟢 緑（許容） | 45件 | 複雑度、ステートメント数、行数、ネスト深度 | 言語実装の性質上必要 |
| 🟡 黄（検討） | 43件 | `any`型使用 | インタプリタの性質上適切 |
| � 黄（検討） | 13件 | 未使用変数・インポート | 型定義や将来使用の可能性 |

**内訳詳細**:
- 複雑度（complexity）: 15件
- ステートメント数（max-statements）: 14件
- 行数（max-lines-per-function）: 5件
- ネスト深度（max-depth）: 13件（lexer.ts: 4件、workerInterpreter.ts: 9件）
- any型（no-explicit-any）: 43件
- 未使用変数（no-unused-vars）: 13件

**合計**: 101件

## 改善計画

### 完了した改善（2025-10-19）

1. **未使用変数のクリーンアップ（第1段階）** ✅ **完了**
   - ✅ `index.ts`: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `currentKeyCode`を削除
   - ✅ `lexer.ts`: `isHex`を削除
   - ✅ `workerInterpreter.ts`: `TokenType`を削除
   - ✅ `RealTimeCLIRunner.ts`: `frameSteps`を削除

   **実績**: 107件 → 101件（6件削減）

2. **未使用変数のクリーンアップ（第2段階）** ✅ **完了**
   - ✅ `workerInterpreter.ts`: 型ガード関数6個を削除
   - ✅ `workerInterpreter.ts`: `InterpreterState`インターフェースを削除
   - ✅ `workerInterpreter.ts`: `WhileStatement`型インポートを削除
   - ✅ `workerInterpreter.ts`: 型アノテーション使用の型にeslint-disable追加
   - ✅ `index.ts`: `e` → `_e`にリネーム
   - ✅ `CharacterVRAMRenderer.ts`: `currentFrame` → `_currentFrame`にリネーム

   **実績**: 101件 → 88件（13件削減）

**累計成果**: 107件 → 88件（19件削減、17.8%改善）

### 今後の改善候補（Optional）

1. **CLIリファクタリング** 🟡
   - サブコマンド実装（SUBCOMMAND_DESIGN.md参照）
   - `parseArgs`の複雑度を削減
   - オプション処理を分離

   **見込み削減**: 3-5件 → 95-97件に

### 長期（将来）

3. **パーサーのモジュール化** 🟢（低優先度）
   - `tokenizeLine`をステートごとに分割（検討）
   - ただし、可読性が低下する可能性があるため慎重に

4. **型安全性の向上** 🟢（低優先度）
   - AST型の厳密化（TypeScript 5.x機能活用）
   - ただし、インタプリタの柔軟性を損なわない範囲で

## コード品質指標

### 現在の状態

```
✅ テスト: 全パス（252テスト、1 skipped）
✅ ビルド: 成功
⚠️ ESLint: 88 warnings, 0 errors
✅ 機能: 全て正常動作
✅ 新規コード: 警告なし
✅ 未使用変数: 完全にクリーンアップ
```

### 目標値

```
短期目標（1-2週間）: ✅ 達成！88件（目標100件以下を大幅に上回る）
中期目標（1-2ヶ月）: 85-90件（CLIリファクタリング）
長期目標（6ヶ月）: 85件前後を維持（言語実装の性質上、これ以上の削減は非現実的）
```

## コード設計の評価と改善提案

### 1. IF実装の設計評価（2025年10月19日）

**評価**: ✅ **優秀（A評価）** - 現状維持を推奨

**設計概要**:
- `IfStatement`（インラインIF）を一時的に作成し、`IfBlockStatement`（ブロックIF）に変換する2段階処理
- `parser.ts`の`tryProcessIfBlock()`と`collectIfBlock()`で実装

**評価理由**:
1. **VTL仕様の忠実な表現**: インラインIF（行内制御）とブロックIF（構造化）を明確に区別
2. **段階的パース**: 字句解析→構造解析の一貫性
3. **再帰処理の一貫性**: ネストされたIFも同じパターンで処理
4. **パフォーマンス影響**: 一時オブジェクト作成はパース時のみ、実行時には影響なし
5. **保守性と可読性**: コードの意図が明確

**改善の余地**: 小（型アサーション`as any`の削減など）
**優先度**: **LOW** - 大規模な変更は不要

---

### 2. FOR/WHILEループ処理の共通化評価（2025年10月19日）

**評価**: ⚠️ **改善の余地あり（B評価）** - リファクタリングを推奨

**問題点**:
1. **コード重複**: `tryProcessForBlock()`と`tryProcessWhileBlock()`が80%以上重複
2. **保守性**: 新しいループ構造（DO-UNTIL等）を追加する際、3箇所の修正が必要
3. **一貫性**: 同じパターンが2箇所にコピー&ペースト

**重複箇所**:

```typescript
// tryProcessForBlock (行205-241) と tryProcessWhileBlock (行247-280) の共通パターン:
// 1. 単独ステートメント検出 (length === 1)
// 2. 型チェック (ForStatement / WhileStatement)
// 3. 一時変数取得 (as any)
// 4. ブロックステートメント作成
// 5. collectLoopBlock() 呼び出し（完全に共通）
// 6. body設定と戻り値作成

// collectLoopBlock (行426-510) 内のFOR/WHILE処理も同様に重複
```

**推奨される改善案**: ヘルパー関数`convertInlineLoopToBlock()`の抽出

```typescript
private convertInlineLoopToBlock(
    inlineStmt: ForStatement | WhileStatement,
    sourceText: string,
    lineNumber: number
): { line: Line; endLine: number } {
    const { body, endLine } = this.collectLoopBlock(lineNumber + 1);
    
    let blockStmt: any;
    if (isForStatement(inlineStmt)) {
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
        blockStmt = {
            type: 'WhileBlockStatement',
            line: lineNumber,
            condition: inlineStmt.condition,
            body: body,
        };
    }
    
    return { line: { lineNumber, statements: [blockStmt], sourceText }, endLine };
}
```

**改善効果**:
- ✅ **コード削減**: 約50-80行（約3-5%削減）
- ✅ **保守性向上**: ループ処理の一元化
- ✅ **拡張性向上**: 新しいループ構造の追加が容易
- ✅ **バグ混入リスク低減**: 修正箇所の削減

**優先度**: **MEDIUM** - IF実装よりも費用対効果が高い

**IF実装との比較**:
| 特徴 | IF実装 | FOR/WHILE実装 |
|------|--------|---------------|
| 共通化の余地 | 低 | 高（80%が共通） |
| 現状の評価 | A（優秀） | B（改善の余地） |
| 改善の効果 | 小 | 大（50-80行削減） |
| リスク | 高（複雑化） | 低（シンプル化） |
| 優先度 | LOW | MEDIUM |

---

## ベストプラクティス

### 新規コードのガイドライン

1. **複雑度**: 新規関数は複雑度15以下を目指す
2. **ステートメント数**: 30ステートメント以下を目指す
3. **未使用変数**: 作成しない（即座に削除）
4. **型指定**: 可能な限り具体的な型を使用（ただしインタプリタ部分は例外）
5. **コード重複**: 共通パターンを見つけたら積極的にヘルパー関数を抽出

### ESLintルールの妥当性

現在のESLint設定は適切です：

- ✅ **複雑度制限（15）**: 一般的なコードには適切
- ✅ **ステートメント数（30）**: 一般的なコードには適切  
- ✅ **行数制限（100）**: 一般的なコードには適切
- ✅ **ネスト深度（4）**: 一般的なコードには適切

言語実装（パーサー・インタプリタ）は本質的に複雑なため、これらの制限を超えるのは正常です。

## 参考情報

### 関連ドキュメント

- `AGENTS.md`: TDD Refactorフェーズでのlintチェック
- `eslint.config.js`: ESLint設定
- `tsconfig.json`: TypeScript設定

### ESLint実行コマンド

```bash
# 全チェック
npm run lint

# 自動修正可能な問題を修正
npm run lint -- --fix

# 特定ファイルのチェック
npm run lint src/index.ts
```

---

*最終更新: 2025年10月19日*
*次回レビュー予定: 2025年11月1日*
