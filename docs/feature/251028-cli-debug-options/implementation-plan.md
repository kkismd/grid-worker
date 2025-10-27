# CLI Runnerデバッグ機能 - 実装計画

## 概要

このドキュメントは、CLI Runnerにインタラクティブデバッグ機能を追加するための実装計画を記述します。

## 実装フェーズ

### Phase 1: MVP（最小viable product）

**目標**: 基本的なブレークポイントとステップ実行機能を提供

**期間**: 2-3日

#### タスク一覧

1. **DebugCLIRunnerクラスの作成** (src/debugCLIRunner.ts)
   - [ ] 基本クラス構造の実装
   - [ ] CLIRunnerからの継承
   - [ ] コンストラクタとconfig定義
   - [ ] executeScript()メソッドのオーバーライド

2. **デバッグループの実装**
   - [ ] debugLoop()メソッド
   - [ ] generator実行とブレーク検知
   - [ ] readline統合
   - [ ] プロンプト表示

3. **基本コマンドハンドラ**
   - [ ] parseCommand()メソッド
   - [ ] handleCommand()メソッド
   - [ ] コマンドディスパッチャ

4. **実行制御コマンド**
   - [ ] continue (c)
   - [ ] step (s, stepIn)
   - [ ] next (n, stepOver)
   - [ ] out (o, stepOut)

5. **基本情報表示**
   - [ ] displayDebugState()
   - [ ] displayCurrentLine()
   - [ ] displayVariables()
   - [ ] print <var>コマンド

6. **ヘルプとユーティリティ**
   - [ ] help (h, ?)コマンド
   - [ ] quit (q, exit)コマンド
   - [ ] setupBreakpoints()

7. **CLIとの統合**
   - [ ] src/cli.tsにbreakpointサブコマンド追加
   - [ ] オプション解析（--break-at, --break-on-start）
   - [ ] DebugCLIRunnerのインスタンス化

8. **テストとドキュメント**
   - [ ] サンプルスクリプトでの動作確認
   - [ ] 基本的な手動テスト
   - [ ] README.mdの更新（簡潔な紹介）

**成果物:**
- `src/debugCLIRunner.ts` (約300行)
- `src/cli.ts`への変更（約50行追加）
- 動作する基本的なデバッガ

### Phase 2: 拡張機能

**目標**: デバッグ体験の向上

**期間**: 2-3日

#### タスク一覧

1. **ブレークポイント動的管理**
   - [ ] break <line>コマンド
   - [ ] delete <line>コマンド
   - [ ] breakpoints (bl)コマンド
   - [ ] clear-breaks (bc)コマンド
   - [ ] displayBreakpoints()メソッド

2. **拡張情報表示**
   - [ ] stack (bt)コマンド - displayCallStack()
   - [ ] grid [size]コマンド - displayGrid()
   - [ ] list [n]コマンド - 拡張displayCurrentLine()
   - [ ] --context <n>オプション

3. **コマンド履歴とUX改善**
   - [ ] readlineの履歴機能有効化
   - [ ] タブ補完（可能であれば）
   - [ ] エラーメッセージの改善
   - [ ] カラー出力の統一

4. **テストとドキュメント**
   - [ ] Phase 2機能の手動テスト
   - [ ] docs/CLI.mdへのbreakpointセクション追加
   - [ ] 実用例の追加

**成果物:**
- `src/debugCLIRunner.ts`の拡張（約+150行）
- `docs/CLI.md`の更新
- 充実した使用例

### Phase 3: 高度な機能（オプショナル）

**目標**: プロダクションレベルのデバッガ機能

**期間**: 3-5日

#### タスク一覧

1. **条件付きブレークポイント**
   - [ ] 条件式パーサー
   - [ ] break <line> if <condition>コマンド
   - [ ] --break-when <condition>オプション
   - [ ] ConditionalBreakpointクラス

2. **ウォッチポイント**
   - [ ] watch <var>コマンド
   - [ ] unwatch <var>コマンド
   - [ ] watches (wl)コマンド
   - [ ] 変数変更検知ロジック

3. **実行履歴**
   - [ ] 履歴記録機構
   - [ ] history コマンド
   - [ ] trace コマンド
   - [ ] 履歴のエクスポート

4. **ブレークポイント設定ファイル**
   - [ ] .wsbreakpointsファイルフォーマット定義
   - [ ] ファイル読み込み機能
   - [ ] ファイル保存機能
   - [ ] --breakpoint-file <file>オプション

5. **スクリプトモード**
   - [ ] デバッグコマンドファイルの読み込み
   - [ ] --script <file>オプション
   - [ ] バッチデバッグ実行

6. **テストとドキュメント**
   - [ ] 単体テストの追加
   - [ ] 統合テストの追加
   - [ ] 詳細なドキュメント化

**成果物:**
- `src/debugCLIRunner.ts`の完全版（約+200行）
- テストスイート
- 包括的なドキュメント

## ファイル構造

```
src/
├── cli.ts                          (変更)
│   └── breakpointサブコマンド追加
│
├── cliRunner.ts                    (変更なし)
│
├── debugCLIRunner.ts               (新規)
│   ├── DebugCLIRunnerConfig
│   ├── DebugCLIRunner
│   │   ├── executeScript()
│   │   ├── debugLoop()
│   │   ├── handleCommand()
│   │   ├── parseCommand()
│   │   ├── continueExecution()
│   │   ├── stepIn()
│   │   ├── stepOver()
│   │   ├── stepOut()
│   │   ├── displayDebugState()
│   │   ├── displayCurrentLine()
│   │   ├── displayVariables()
│   │   ├── displayCallStack()
│   │   ├── displayGrid()
│   │   └── displayBreakpoints()
│   └── utility functions
│
└── workerInterpreter.ts            (変更なし)

docs/
└── feature/
    └── 251028-cli-debug-options/
        ├── cli-debug-design.md       (完成)
        ├── usage.md                  (完成)
        └── implementation-plan.md    (このファイル)
```

## 実装の詳細

### DebugCLIRunnerクラスの実装

#### Phase 1: 基本構造

```typescript
// src/debugCLIRunner.ts

import * as readline from 'readline';
import { CLIRunner, CLIRunnerConfig } from './cliRunner.js';
import WorkerInterpreter from './workerInterpreter.js';

export interface DebugCLIRunnerConfig extends CLIRunnerConfig {
    breakAt?: number[];
    breakOnStart?: boolean;
    stepMode?: boolean;
    showContext?: number;
}

export class DebugCLIRunner extends CLIRunner {
    private interpreter!: WorkerInterpreter;
    private generator: Generator<void, void, void> | null = null;
    private isDebugging: boolean = true;
    private rl!: readline.Interface;
    private scriptLines: string[] = [];
    private debugConfig: DebugCLIRunnerConfig;
    
    constructor(config: DebugCLIRunnerConfig) {
        super(config);
        this.debugConfig = config;
    }
    
    async executeScript(script: string, scriptName?: string): Promise<void> {
        // スクリプト行を保存
        this.scriptLines = script.split('\n');
        
        // 親クラスのセットアップを利用しつつ、
        // デバッグ用の拡張を行う
        
        // readline初期化
        this.setupReadline();
        
        // インタプリタ作成（親クラスと同じ方法）
        // ただしインスタンスを保持
        
        // 初期ブレークポイント設定
        if (this.debugConfig.breakAt) {
            this.setupBreakpoints(this.debugConfig.breakAt);
        }
        
        // 開始時ブレーク
        if (this.debugConfig.breakOnStart) {
            this.interpreter.setBreakpoint(0);
        }
        
        // generator開始
        this.generator = this.interpreter.run();
        
        // デバッグループ
        await this.debugLoop();
        
        // クリーンアップ
        this.rl.close();
        
        // 結果表示（親クラスのメソッド利用）
        this.displayResults();
    }
    
    private setupReadline(): void {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'debug> '
        });
    }
    
    private setupBreakpoints(lines: number[]): void {
        for (const line of lines) {
            this.interpreter.setBreakpoint(line);
        }
        console.log(`✅ Breakpoints set at: ${lines.join(', ')}`);
    }
    
    private async debugLoop(): Promise<void> {
        if (!this.generator) return;
        
        let result = this.generator.next();
        
        while (!result.done && this.isDebugging) {
            const mode = this.interpreter.getDebugMode();
            
            if (mode === 'break') {
                // ブレーク状態表示
                this.displayDebugState();
                
                // コマンド入力待ち
                const shouldContinue = await this.waitForCommand();
                if (!shouldContinue) {
                    this.isDebugging = false;
                    break;
                }
            }
            
            result = this.generator.next();
        }
        
        if (result.done) {
            console.log('🟢 Program completed');
        }
    }
    
    private async waitForCommand(): Promise<boolean> {
        return new Promise((resolve) => {
            this.rl.question('', async (input) => {
                const shouldContinue = await this.handleCommand(input.trim());
                if (shouldContinue) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
            this.rl.prompt();
        });
    }
    
    private async handleCommand(input: string): Promise<boolean> {
        const { command, args } = this.parseCommand(input);
        
        switch (command) {
            case 'c':
            case 'continue':
                this.interpreter.continue();
                return true;
                
            case 's':
            case 'step':
            case 'stepIn':
                this.interpreter.stepIn();
                return true;
                
            case 'n':
            case 'next':
            case 'stepOver':
                this.interpreter.stepOver();
                return true;
                
            case 'o':
            case 'out':
            case 'stepOut':
                this.interpreter.stepOut();
                return true;
                
            case 'p':
            case 'print':
                if (args.length > 0) {
                    this.displayVariables(args[0]);
                }
                return false; // コマンド実行後も待機
                
            case 'v':
            case 'vars':
            case 'variables':
                this.displayVariables();
                return false;
                
            case 'l':
            case 'line':
            case 'where':
                this.displayCurrentLine();
                return false;
                
            case 'h':
            case 'help':
            case '?':
                this.displayHelp();
                return false;
                
            case 'q':
            case 'quit':
            case 'exit':
                return false;
                
            default:
                console.log(`Unknown command: ${command}`);
                console.log('Type "help" for available commands');
                return false;
        }
    }
    
    private parseCommand(input: string): { command: string; args: string[] } {
        const parts = input.split(/\s+/);
        return {
            command: parts[0] || '',
            args: parts.slice(1)
        };
    }
    
    private displayDebugState(): void {
        const line = this.interpreter.getCurrentLine();
        console.log(`\n🔴 Breakpoint at line ${line}`);
        console.log('═'.repeat(60));
        this.displayCurrentLine(this.debugConfig.showContext || 2);
        console.log('═'.repeat(60));
        
        // 変数表示（簡易版）
        const vars = this.interpreter.getVariables();
        if (vars.size > 0) {
            const varStr = Array.from(vars.entries())
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');
            console.log(`Variables: ${varStr}`);
        }
        
        // コールスタック
        const stack = this.interpreter.getCallStack();
        console.log(`Call Stack: [${stack.join(', ')}] (depth: ${stack.length})`);
        
        console.log(`Mode: ${this.interpreter.getDebugMode()}\n`);
    }
    
    private displayCurrentLine(context: number = 2): void {
        const currentLine = this.interpreter.getCurrentLine();
        const start = Math.max(0, currentLine - context);
        const end = Math.min(this.scriptLines.length - 1, currentLine + context);
        
        for (let i = start; i <= end; i++) {
            const marker = i === currentLine ? '▶' : ' ';
            const lineNum = i.toString().padStart(3);
            console.log(`${marker} ${lineNum} │ ${this.scriptLines[i]}`);
        }
    }
    
    private displayVariables(varName?: string): void {
        const vars = this.interpreter.getVariables();
        
        if (varName) {
            const value = vars.get(varName) ?? 0;
            console.log(`${varName} = ${value}`);
        } else {
            console.log(`Variables (${vars.size}):`);
            for (const [name, value] of vars.entries()) {
                console.log(`  ${name} = ${value}`);
            }
        }
    }
    
    private displayHelp(): void {
        console.log(`
Debug Commands:
  Execution Control:
    c, continue       - Continue to next breakpoint
    s, step, stepIn   - Step into next statement
    n, next, stepOver - Step over (skip subroutines)
    o, out, stepOut   - Step out of current subroutine
    
  Information:
    p <var>           - Print variable value
    v, vars           - Show all variables
    l, line           - Show current line
    
  Other:
    h, help, ?        - Show this help
    q, quit, exit     - Quit debugger
`);
    }
}
```

### CLIとの統合

#### src/cli.tsへの変更

```typescript
// 型定義に追加
type Subcommand = 'run' | 'exec' | 'debug' | 'watch' | 'text' | 'play' | 'repl' | 'bench' | 'breakpoint';

// サブコマンド定義に追加
const SUBCOMMANDS: Record<Subcommand, SubcommandConfig> = {
    // ... 既存のサブコマンド ...
    
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
};

// オプション定義に追加
interface CLIOptions {
    // ... 既存のオプション ...
    breakAt?: string;
    breakOnStart?: boolean;
    stepMode?: boolean;
    showContext?: number;
}

// オプション解析に追加
// yargs または手動パーサーに以下を追加
// --break-at, -b
// --break-on-start
// --step-mode
// --context

// ランナー起動部分に追加
if (subcommand.runner === 'debug') {
    const { DebugCLIRunner } = await import('./debugCLIRunner.js');
    
    const debugConfig: DebugCLIRunnerConfig = {
        ...baseConfig,
        breakAt: options.breakAt ? 
            options.breakAt.split(',').map(Number) : 
            undefined,
        breakOnStart: options.breakOnStart,
        stepMode: options.stepMode,
        showContext: options.showContext || 2
    };
    
    const runner = new DebugCLIRunner(debugConfig);
    await runner.executeScript(script, scriptPath);
}
```

## テスト計画

### Phase 1: 手動テスト

1. **基本的なブレークポイント**
   - シンプルなスクリプトで`--break-at`オプションテスト
   - ブレークポイントで正しく停止するか確認

2. **ステップ実行**
   - `step`, `next`, `out`コマンドの動作確認
   - 変数の値が正しく更新されるか確認

3. **情報表示**
   - 現在行、変数、コールスタックの表示確認

### Phase 2: 統合テスト

1. **複雑なフロー**
   - ネストしたサブルーチン
   - ループ内のブレークポイント
   - 複数ブレークポイントの動作

2. **エッジケース**
   - 存在しない行番号
   - 未初期化変数の参照
   - 空のスクリプト

### Phase 3: 自動テスト（オプショナル）

1. **単体テスト**
   - `parseCommand()`
   - 各display関数
   - ブレークポイント管理

2. **E2Eテスト**
   - スクリプト実行の自動化
   - コマンド入力の自動化（expect的なツール使用）

## マイルストーン

### Milestone 1: Phase 1 完了
- [ ] DebugCLIRunnerの基本実装
- [ ] CLIとの統合
- [ ] 基本コマンドの動作確認
- [ ] 簡単な手動テスト完了

### Milestone 2: Phase 2 完了
- [ ] 拡張機能の実装
- [ ] ドキュメントの充実
- [ ] 実用例の作成
- [ ] ユーザーフィードバック収集

### Milestone 3: Phase 3 完了（オプショナル）
- [ ] 高度な機能の実装
- [ ] テストスイートの整備
- [ ] 包括的なドキュメント
- [ ] プロダクション準備完了

## リスク管理

### 技術的リスク

1. **Readlineの非同期処理**
   - リスク: generatorとreadlineの統合が複雑
   - 対策: Promise wrapperで順次処理を保証

2. **パフォーマンス**
   - リスク: デバッグモードでの実行速度低下
   - 対策: WorkerInterpreterのデバッグAPIは既に最適化済み

3. **エラーハンドリング**
   - リスク: 予期しない入力でクラッシュ
   - 対策: 包括的なtry-catchとバリデーション

### プロジェクトリスク

1. **スコープクリープ**
   - リスク: 機能追加で肥大化
   - 対策: Phase制で段階的実装

2. **既存機能への影響**
   - リスク: CLIRunnerの変更が他に影響
   - 対策: 継承ベースで親クラスは変更しない

## 次のステップ

1. Phase 1の実装開始
2. 基本動作の確認
3. ユーザーフィードバック収集
4. Phase 2への移行判断

## まとめ

この実装計画に従うことで、WorkerScriptのCLI環境に強力なデバッグ機能を段階的に追加できます。Phase 1のMVPを早期に提供し、ユーザーフィードバックを得ながら機能を拡張していくアプローチにより、実用的で保守性の高いデバッガを実現します。
