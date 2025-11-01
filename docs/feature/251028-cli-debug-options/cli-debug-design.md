# CLI Runnerデバッグ機能の設計

## 概要

WorkerInterpreterに実装済みのブレークポイントとステップ実行機能をCLI runnerから利用可能にするための設計ドキュメント。

## 背景

### 既存実装の状況

1. **WorkerInterpreter**: `src/workerInterpreter.ts`にデバッグAPIが実装済み
   - ブレークポイント管理: `setBreakpoint()`, `removeBreakpoint()`, `clearBreakpoints()`, `getBreakpoints()`
   - 実行制御: `continue()`, `stepIn()`, `stepOver()`, `stepOut()`
   - デバッグ情報取得: `getCurrentLine()`, `getVariables()`, `getCallStack()`, `getDebugMode()`

2. **CLIサブコマンドシステム**: `src/cli.ts`に8つのサブコマンドが既に存在
   - `run`, `exec`, `debug`, `watch`, `text`, `play`, `repl`, `bench`

3. **ドキュメント**: `docs/feature/251026-breakpoint-step-execution/`に詳細なデバッグ機能仕様あり

## 設計方針

### 基本アプローチ

既存の`debug`サブコマンドは詳細ログ出力用として維持し、新しくインタラクティブデバッグ専用のサブコマンドを追加する。

### 実装の原則

1. **最小限の変更**: 既存のCLIRunnerやWorkerInterpreterの動作を変更しない
2. **再利用**: WorkerInterpreterのデバッグAPIを最大限活用
3. **直感的なUX**: GDBやNode.js Debuggerに類似したコマンド体系
4. **段階的実装**: Phase 1（必須）→ Phase 2（拡張）→ Phase 3（高度）の順で実装

## 機能設計

### 1. 新規サブコマンド: `breakpoint`

```bash
# 基本実行
npm run cli breakpoint examples/test.ws

# ブレークポイント付き実行
npm run cli breakpoint examples/test.ws --break-at 2,5

# 開始時にブレーク
npm run cli breakpoint examples/test.ws --break-on-start
```

**サブコマンド定義:**
```typescript
breakpoint: {
    name: 'breakpoint',
    description: 'インタラクティブデバッグ実行',
    runner: 'debug',
    defaults: {
        debug: true,
        verbose: false,
        unlimitedSteps: true,
        quiet: false
    }
}
```

### 2. コマンドラインオプション

#### 新規追加するオプション

```typescript
interface DebugCLIOptions extends CLIOptions {
    breakAt?: string;           // "2,5,10" 形式の行番号リスト
    breakOnStart?: boolean;     // 開始時に即座にブレーク
    stepMode?: boolean;         // ステップモードで開始
    showContext?: number;       // 現在行の前後何行を表示するか（デフォルト: 2）
}
```

**コマンドライン引数:**
- `--break-at <lines>` / `-b <lines>`: カンマ区切りの行番号リスト
- `--break-on-start`: 最初のステートメント実行前にブレーク
- `--step-mode`: 各ステートメント実行後に自動的にブレーク
- `--context <n>`: 現在行の前後n行を表示（デフォルト: 2）

### 3. インタラクティブデバッグコマンド

ブレークポイント停止時に利用可能なコマンド体系:

#### 実行制御コマンド

| コマンド | エイリアス | 説明 |
|---------|-----------|------|
| `continue` | `c` | 次のブレークポイントまで実行 |
| `step` | `s`, `stepIn` | ステップイン（次のステートメント実行） |
| `next` | `n`, `stepOver` | ステップオーバー（サブルーチンをスキップ） |
| `out` | `o`, `stepOut` | ステップアウト（サブルーチンから抜ける） |

#### ブレークポイント管理コマンド

| コマンド | エイリアス | 説明 |
|---------|-----------|------|
| `break <line>` | `b <line>` | 指定行にブレークポイント追加 |
| `delete <line>` | `d <line>` | 指定行のブレークポイント削除 |
| `breakpoints` | `bl`, `list-breaks` | ブレークポイント一覧表示 |
| `clear-breaks` | `bc` | 全ブレークポイントクリア |

#### 情報表示コマンド

| コマンド | エイリアス | 説明 |
|---------|-----------|------|
| `print <var>` | `p <var>` | 変数の値を表示 |
| `variables` | `vars`, `v` | 全変数を表示 |
| `line` | `l`, `where` | 現在の行を表示 |
| `list [n]` | `ls [n]` | 現在行の前後n行を表示 |
| `stack` | `bt`, `backtrace` | コールスタックを表示 |
| `grid [size]` | `g [size]` | グリッドの一部を表示 |

#### その他のコマンド

| コマンド | エイリアス | 説明 |
|---------|-----------|------|
| `help` | `h`, `?` | ヘルプ表示 |
| `quit` | `q`, `exit` | デバッグ終了 |

### 4. デバッグ情報の表示形式

#### ブレークポイント停止時の表示

```
🔴 Breakpoint at line 2
════════════════════════════════════════════════════════════
  0 │ A=0
  1 │ ^LOOP
▶ 2 │ A=A+1
  3 │ !(A)
  4 │ IF A<10 GOTO ^LOOP
════════════════════════════════════════════════════════════
Variables: A=1, X=0, Y=0
Call Stack: [] (depth: 0)
Mode: break

debug> 
```

#### 各種情報表示フォーマット

**変数表示:**
```
debug> p A
A = 5

debug> vars
Variables (3):
  A = 5
  B = 10
  X = 2
```

**コールスタック表示:**
```
debug> stack
Call Stack (depth: 2):
  #0: line 15 (current)
  #1: line 8  (caller)
  #2: line 2  (caller)
```

**グリッド表示:**
```
debug> grid 5
Grid (top-left 5x5):
   0 1 2 3 4
  ┌─────────┐
0 │░ . . . .│
1 │. ░ . . .│
2 │. . ░ . .│
3 │. . . ░ .│
4 │. . . . ░│
  └─────────┘
```

## アーキテクチャ設計

### クラス構造

```
CLIRunner (既存)
    ↑
    │
DebugCLIRunner (新規)
    ├─ debugLoop(): Promise<void>
    ├─ handleCommand(cmd: string): Promise<boolean>
    ├─ displayDebugState(): void
    ├─ displayCurrentLine(context: number): void
    ├─ displayVariables(): void
    ├─ displayCallStack(): void
    └─ displayGrid(size: number): void
```

### ファイル構成

```
src/
├── cli.ts                          (変更: breakpointサブコマンド追加)
├── cliRunner.ts                    (変更なし)
├── debugCLIRunner.ts               (新規: デバッグ専用ランナー)
└── workerInterpreter.ts            (変更なし: 既存API利用)
```

### DebugCLIRunnerクラスの設計

```typescript
export interface DebugCLIRunnerConfig extends CLIRunnerConfig {
    breakAt?: number[];         // 初期ブレークポイント
    breakOnStart?: boolean;     // 開始時にブレーク
    stepMode?: boolean;         // ステップモード
    showContext?: number;       // 表示コンテキスト行数
}

export class DebugCLIRunner extends CLIRunner {
    private interpreter: WorkerInterpreter;
    private generator: Generator<void, void, void> | null = null;
    private isDebugging: boolean = true;
    private rl: readline.Interface;
    private scriptLines: string[] = [];
    
    constructor(config: DebugCLIRunnerConfig);
    
    // メインエントリーポイント
    async executeScript(script: string, scriptName?: string): Promise<void>;
    
    // デバッグループ
    private async debugLoop(): Promise<void>;
    
    // コマンド処理
    private async handleCommand(command: string): Promise<boolean>;
    
    // 実行制御
    private async continueExecution(): Promise<void>;
    private async stepIn(): Promise<void>;
    private async stepOver(): Promise<void>;
    private async stepOut(): Promise<void>;
    
    // 表示機能
    private displayDebugState(): void;
    private displayCurrentLine(context: number): void;
    private displayVariables(varName?: string): void;
    private displayCallStack(): void;
    private displayGrid(size?: number): void;
    private displayBreakpoints(): void;
    
    // ユーティリティ
    private setupBreakpoints(lines: number[]): void;
    private waitForBreak(): Promise<void>;
    private parseCommand(input: string): { command: string; args: string[] };
}
```

### 実行フロー

```
1. DebugCLIRunner.executeScript()
   ↓
2. スクリプトロード & インタプリタ初期化
   ↓
3. 初期ブレークポイント設定
   ↓
4. generator = interpreter.run()
   ↓
5. debugLoop() 開始
   ↓
6. [ループ]
   ├─ generator.next() 実行
   ├─ ブレークチェック
   ├─ ブレーク時: displayDebugState()
   ├─ コマンド入力待ち
   ├─ handleCommand() でコマンド処理
   └─ done判定
   ↓
7. 実行完了 & 結果表示
```

## 実装フェーズ

### Phase 1: 必須機能（MVP）

**目標**: 基本的なブレークポイントとステップ実行を実現

**実装項目:**
1. `DebugCLIRunner`クラスの基本構造
2. ブレークポイント設定オプション（`--break-at`, `--break-on-start`）
3. 基本デバッグコマンド:
   - 実行制御: `continue`, `step`, `next`, `out`
   - 情報表示: `line`, `variables`, `print`
   - その他: `help`, `quit`
4. 基本的な状態表示（現在行、変数、モード）
5. `breakpoint`サブコマンドの追加

**期待される成果物:**
- `src/debugCLIRunner.ts`
- `src/cli.ts`への統合
- 基本動作確認用のテストスクリプト

### Phase 2: 拡張機能

**目標**: デバッグ体験の向上

**実装項目:**
1. コールスタック表示（`stack`コマンド）
2. グリッド表示統合（`grid`コマンド）
3. ブレークポイント動的管理:
   - `break <line>`: 実行中にブレークポイント追加
   - `delete <line>`: ブレークポイント削除
   - `breakpoints`: ブレークポイント一覧
4. 拡張表示機能:
   - `list [n]`: コンテキスト行数指定
   - `--context <n>`: デフォルトコンテキスト設定
5. コマンド履歴（readline機能利用）

### Phase 3: 高度な機能

**目標**: プロダクションレベルのデバッガ機能

**実装項目:**
1. 条件付きブレークポイント:
   ```bash
   --break-when "A>10"
   debug> break 5 if A>10
   ```
2. ウォッチポイント（変数監視）:
   ```bash
   debug> watch A
   debug> unwatch A
   ```
3. 実行履歴トレース:
   ```bash
   debug> history
   debug> trace
   ```
4. ブレークポイント設定ファイル:
   ```bash
   # .wsbreakpoints ファイル
   2
   5
   10
   ```
5. スクリプトモード（コマンドの自動実行）:
   ```bash
   npm run cli breakpoint test.ws --script debug-script.txt
   ```

## 技術的な考慮事項

### 1. Readline統合

Node.jsの`readline`モジュールを使用して、インタラクティブなコマンド入力を実現:

```typescript
import * as readline from 'readline';

this.rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'debug> '
});

// コマンド履歴機能の有効化
this.rl.on('line', (line) => {
    this.handleCommand(line);
});
```

### 2. 既存機能との競合回避

- `--realtime`モードとの併用は非対応（相互排他）
- `--quiet`オプションはデバッグモードでは無視
- `--output`はデバッグセッション終了後の最終結果のみ保存

### 3. エラーハンドリング

- 無効な行番号指定時の警告
- 存在しない変数参照時のエラーメッセージ
- コマンド解析エラーの適切な通知

### 4. パフォーマンス

- ブレークポイントチェックはWorkerInterpreter内部で実施（既存実装を利用）
- デバッグモードによるオーバーヘッドは最小限（generator yieldの自然な活用）

## テスト戦略

### 単体テスト

1. `DebugCLIRunner`の各メソッド
2. コマンドパーサー（`parseCommand()`）
3. 表示フォーマット関数

### 統合テスト

1. エンドツーエンドのデバッグセッション
2. 各デバッグコマンドの動作確認
3. ブレークポイントとステップ実行の連携

### 手動テスト

1. サンプルスクリプトでの実際の使用感確認
2. エッジケース（ネストしたサブルーチン、ループなど）の検証
3. エラーハンドリングの確認

## ドキュメント

### 更新が必要なドキュメント

1. `docs/CLI.md`: `breakpoint`サブコマンドのセクション追加
2. `README.md`: デバッグ機能の簡潔な紹介
3. `docs/feature/251028-cli-debug-options/usage.md`: 詳細な使用方法（新規作成）

## まとめ

この設計により、WorkerInterpreterに既に実装されているブレークポイントとステップ実行機能を、CLI環境から直感的に利用可能になります。GDBやNode.js Debuggerに類似したコマンド体系を採用することで、開発者にとって親しみやすいデバッグ体験を提供できます。

段階的な実装アプローチ（Phase 1 → 2 → 3）により、MVP（最小viable product）を早期に提供しつつ、継続的に機能を拡張していくことが可能です。
