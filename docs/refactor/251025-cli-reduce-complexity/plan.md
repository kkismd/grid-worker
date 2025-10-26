# CLI複雑度削減タスク (Phase 1)

## タスク概要
`cli.ts`の`parseArgs`関数と`main`関数の複雑度とステートメント数を削減する。

## 現在の状態
- **Branch**: `refactor/cli-reduce-complexity`
- **Lint警告数**: 63件（0 errors, 63 warnings）
- **テスト状態**: ✅ 全てパス（130 passed, 1 skipped）
- **前タスク**: lexer-reduce-nesting完了（max-depth警告4件解消）

## 対象の警告

### 1. parseArgs関数（231行目）
- **複雑度**: 47 → 目標: 15以下
- **行数**: 118行 → 目標: 100行以下
- **問題点**:
  - 多数のオプション処理が1つの関数に集中
  - ヘルプメッセージの表示ロジックが混在
  - 引数の検証とパースが分離されていない

### 2. main関数（502行目）
- **複雑度**: 27 → 目標: 15以下
- **ステートメント数**: 42 → 目標: 30以下
- **問題点**:
  - 初期化処理と実行処理が混在
  - 各実行モード（通常/リアルタイム/インタラクティブ）の処理が分離されていない

## 改善方針

### parseArgs関数の分割

#### 方針1: ヘルプ表示の分離
```typescript
function showHelp(): void {
  // ヘルプメッセージの表示
}
```

#### 方針2: オプション処理の分離
```typescript
function parseOption(
  arg: string, 
  nextArg: string | undefined, 
  options: CLIOptions
): { consumed: number; error?: string } {
  // 各オプションの処理
}
```

#### 方針3: サブコマンド処理の分離（該当する場合）
```typescript
function parseSubcommand(args: string[]): SubcommandResult {
  // サブコマンドの処理
}
```

### main関数の分割

#### 方針1: 初期化処理の分離
```typescript
async function initializeEnvironment(options: CLIOptions): Promise<void> {
  // 環境変数、ログ設定など
}
```

#### 方針2: 実行モード別の処理分離
```typescript
async function executeNormalMode(scriptFile: string, options: CLIOptions): Promise<void> {
  // 通常モードの実行
}

async function executeRealtimeMode(scriptFile: string, options: CLIOptions): Promise<void> {
  // リアルタイムモードの実行
}

async function executeInteractiveMode(options: CLIOptions): Promise<void> {
  // インタラクティブモードの実行
}
```

## 実施ステップ

### ステップ1: TDDサイクル開始前の確認 ✅
- [x] Lint警告数: 63件
- [x] テスト状態: Green
- [x] ブランチ作成: `refactor/cli-reduce-complexity`
- [x] ドキュメントディレクトリ作成

### ステップ2: parseArgs関数のリファクタリング
1. [ ] showHelp関数の抽出
2. [ ] parseOption関数の抽出
3. [ ] parseArgs関数の簡素化
4. [ ] テストが全てパスすることを確認
5. [ ] `npm run lint`でコード品質を確認
6. [ ] コミット

### ステップ3: main関数のリファクタリング
1. [ ] initializeEnvironment関数の抽出
2. [ ] 各実行モード関数の抽出
3. [ ] main関数の簡素化
4. [ ] テストが全てパスすることを確認
5. [ ] `npm run lint`でコード品質を確認
6. [ ] コミット

### ステップ4: 最終確認
1. [ ] 全テストがパスすることを確認
2. [ ] Lint警告数の確認（63件 → 59件）
3. [ ] 動作確認
4. [ ] ドキュメント更新（result.md作成）

## 期待される結果
- parseArgs関数の複雑度: 47 → 15以下
- parseArgs関数の行数: 118行 → 100行以下
- main関数の複雑度: 27 → 15以下
- main関数のステートメント数: 42 → 30以下
- **総警告数**: 63件 → 59件（-4件）
- **テスト**: 全てパス（変更なし）

## 参考資料
- `roadmap-reference.md`: 全体の改善ロードマップ
- `../lexer-reduce-nesting/`: 前回のリファクタリング事例

## 注意事項
- CLIの動作に影響を与えないこと
- 既存のオプションとその挙動を維持すること
- エラーメッセージの内容を変更しないこと
- テストが全てパスすることを確認しながら進めること
