# コード品質管理ドキュメント

## 概要

このドキュメントは、プロジェクトのコード品質状況を記録し、今後の改善計画を管理します。

## ESLint警告の現状（2025年10月19日時点）

### 統計サマリー

```
総警告数: 107件
エラー数: 0件
```

すべてのコードは正常に動作しており、警告はコード品質の改善提案です。

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
| `workerInterpreter.ts` | 216-227 | 5-8 | 4 | FORループのネスト処理 |
| `workerInterpreter.ts` | 243-256 | 5-8 | 4 | WHILEループのネスト処理 |

**評価**: 
- レキサーとループ実装で構造的に必要な深度
- アルゴリズムの性質上、避けがたい

**対応方針**: 🟢 **現状維持**

#### 5. 型指定警告（@typescript-eslint/no-explicit-any）

**影響ファイル**: 全ファイル

| ファイル | 件数 | 理由 |
|---------|------|------|
| `parser.ts` | 15 | AST構造が動的 |
| `workerInterpreter.ts` | 25 | ステートメント・式の型が実行時に決定 |
| `cliRunner.ts` | 2 | コールバック関数の柔軟性 |
| `RealTimeCLIRunner.ts` | 3 | コールバック関数の柔軟性 |
| `index.ts` | 2 | DOM操作の柔軟性 |

**評価**: 
- インタプリタの動的な性質上、`any`型の使用は適切
- AST構造は実行時に型が決定される

**対応方針**: 🟢 **現状維持**（インタプリタの性質上必要）

#### 6. 未使用変数警告（@typescript-eslint/no-unused-vars）

**影響ファイル**: 複数

| ファイル | 変数 | 理由 | 対応 |
|---------|------|------|------|
| `index.ts` | `CANVAS_WIDTH`, `CANVAS_HEIGHT` | 未実装の機能用 | 🔴 削除可能 |
| `index.ts` | `currentKeyCode` | デバッグ用 | 🔴 削除可能 |
| `lexer.ts` | `isHex` | 未使用のローカル変数 | 🔴 削除すべき |
| `workerInterpreter.ts` | `TokenType`, `Identifier`等 | 未使用のインポート | 🔴 削除すべき |
| `RealTimeCLIRunner.ts` | `frameSteps` | デバッグ用 | 🟡 削除または活用 |
| `CharacterVRAMRenderer.ts` | `currentFrame` | 未使用の引数 | 🟡 `_currentFrame`にリネーム |

**評価**: これらは実際の不要なコード

**対応方針**: 🔴 **要修正**（優先度：中）

#### 7. その他の警告

- **警告なし**: 新規実装コード（配列機能、トランスクリプト出力）はクリーン ✅

### 警告の優先度別サマリー

| 優先度 | 件数 | 種別 | 対応 |
|--------|------|------|------|
| 🟢 緑（許容） | 約90件 | 複雑度、ステートメント数、行数、ネスト深度 | 言語実装の性質上必要 |
| 🟡 黄（検討） | 約10件 | `any`型使用 | インタプリタの性質上適切 |
| 🔴 赤（要修正） | 約7件 | 未使用変数・インポート | クリーンアップすべき |

## 改善計画

### 短期（1-2週間）

1. **未使用変数のクリーンアップ** 🔴
   - `index.ts`: `CANVAS_WIDTH`, `CANVAS_HEIGHT`, `currentKeyCode`を削除
   - `lexer.ts`: `isHex`を削除
   - `workerInterpreter.ts`: 未使用インポートを削除
   - `RealTimeCLIRunner.ts`: `frameSteps`を削除または使用
   - `CharacterVRAMRenderer.ts`: `_currentFrame`にリネーム

   **見込み削減**: 7件 → 100件に

### 中期（1-2ヶ月）

2. **CLIリファクタリング** 🟡
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
✅ テスト: 全パス
✅ ビルド: 成功
⚠️ ESLint: 107 warnings, 0 errors
✅ 機能: 全て正常動作
✅ 新規コード: 警告なし
```

### 目標値

```
短期目標（1-2週間）: 100 warnings以下
中期目標（1-2ヶ月）: 95 warnings以下
長期目標（6ヶ月）: 現状維持（言語実装の性質上、これ以上の削減は非現実的）
```

## ベストプラクティス

### 新規コードのガイドライン

1. **複雑度**: 新規関数は複雑度15以下を目指す
2. **ステートメント数**: 30ステートメント以下を目指す
3. **未使用変数**: 作成しない（即座に削除）
4. **型指定**: 可能な限り具体的な型を使用（ただしインタプリタ部分は例外）

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
