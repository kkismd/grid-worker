# マルチワーカー相互作用実現のための実装計画

## 概要

本計画は、マルチワーカー環境でのリアルタイムな相互作用を実現するための包括的な実装計画です。
従来のバッチ処理方式から、真のマルチワーカー駆動方式へと移行します。

## 前提知識

### 現状の問題点の詳細

**従来の駆動方式（バッチ処理）:**
```
Frame N:
  Worker A: steps/frame回ステートメント実行（例: 1000回）
  Worker B: steps/frame回ステートメント実行（例: 1000回）
  Worker C: steps/frame回ステートメント実行（例: 1000回）
  → 画面更新
```

この方式では、Worker Aが1000ステップ実行している間、Worker BとCは完全に停止しています。
Worker Aがグリッドに書き込んだデータを、Worker BとCは1000ステップ後まで参照できません。

**正しい駆動方式（インタリーブ実行）:**
```
Frame N:
  Step 1:
    Worker A: 1ステートメント実行
    Worker B: 1ステートメント実行
    Worker C: 1ステートメント実行
  Step 2:
    Worker A: 1ステートメント実行
    Worker B: 1ステートメント実行
    Worker C: 1ステートメント実行
  ...
  Step 1000:
    Worker A: 1ステートメント実行
    Worker B: 1ステートメント実行
    Worker C: 1ステートメント実行
  → 画面更新
```

この方式では、各ワーカーが交互に実行されるため、グリッドへの変更が即座に他のワーカーから参照可能になります。

### 設計の基本方針

1. **インタプリタの状態管理はシンプルに保つ**
   - インタプリタ自身は実行状態（Running, Halted, WaitingForNextFrame）のみを管理
   - マルチワーカー調整ロジックはインタプリタの外側で実装

2. **ワーカー管理側の責務を明確化**
   - 複数ワーカーの実行順序制御
   - フレーム境界の管理
   - steps/frameの実行制御

3. **一貫性のある状態遷移**
   - 各状態の意味と遷移条件を明確に定義
   - 予測可能な動作を保証

## 実装の全体像

### フェーズ1: インタプリタへの状態追加（WorkerInterpreter）

#### 1.1 実行状態の定義

**ファイル:** `src/workerInterpreter.ts`

```typescript
/**
 * インタプリタの実行状態
 */
enum InterpreterState {
    Running = 'running',              // 通常実行中
    Halted = 'halted',                // プログラム停止（#=-1）
    WaitingForNextFrame = 'waiting'   // 次フレーム待機（#=`）
}
```

#### 1.2 状態管理フィールドの追加

```typescript
class WorkerInterpreter {
    // 既存のフィールド
    private currentLineIndex: number = 0;
    private callStack: number[] = [];
    // ... 他の既存フィールド

    // 新規追加: 実行状態管理
    private state: InterpreterState = InterpreterState.Running;
}
```

#### 1.3 状態取得メソッドの追加

```typescript
/**
 * 現在の実行状態を取得
 */
public getState(): InterpreterState {
    return this.state;
}

/**
 * 実行可能かどうかを判定
 */
public canExecute(): boolean {
    return this.state === InterpreterState.Running;
}

/**
 * 次フレーム待機状態から復帰
 */
public resumeFromFrameWait(): void {
    if (this.state === InterpreterState.WaitingForNextFrame) {
        this.state = InterpreterState.Running;
    }
}
```

#### 1.4 状態遷移を引き起こすステートメント実行の実装

**新しいステートメント型の追加（`src/ast.ts`）:**

```typescript
/**
 * フレーム待機ステートメント: #=`
 */
export interface WaitForNextFrameStatement extends BaseStatement {
    type: 'WaitForNextFrameStatement';
}
```

**パーサーへの文法追加（`src/parser.ts`）:**

`#` への代入文のパース処理に、`` ` `` トークンのケースを追加:

```typescript
private parseHashAssignment(tokens: Token[]): Statement {
    // 既存: #=-1（停止）、#=^LABEL（GOTO）、#=!（RETURN）、#=;（IF終了）、#=@（ループ終了）
    
    // 新規追加: #=`（次フレーム待機）
    if (tokens[2]?.type === 'GRIDDATA') {
        return {
            type: 'WaitForNextFrameStatement',
            line: tokens[0].line,
            column: tokens[0].column
        };
    }
    
    // ... 既存の処理
}
```

**インタプリタでの実行処理（`src/workerInterpreter.ts`）:**

```typescript
/**
 * フレーム待機ステートメントを実行
 */
private executeWaitForNextFrame(statement: any): ExecutionResult {
    this.state = InterpreterState.WaitingForNextFrame;
    // このステートメント自体はジャンプではないが、
    // 実行を一時停止するため、特別なフラグを返す
    return { jump: false, halt: false };
}
```

ステートメントエグゼキュータのマップに追加:

```typescript
private initializeStatementExecutors(): void {
    // 既存のマッピング
    this.statementExecutors.set('HaltStatement', (s) => this.executeHalt(s));
    // ...
    
    // 新規追加
    this.statementExecutors.set('WaitForNextFrameStatement', (s) => this.executeWaitForNextFrame(s));
}
```

#### 1.5 run()ジェネレーターの修正

実行ループで状態をチェックし、WaitingForNextFrameの場合は実行を中断:

```typescript
*run(): Generator<void, void, unknown> {
    if (!this.program) {
        throw new Error('スクリプトがロードされていません。loadScript()を呼び出してください。');
    }

    while (true) {
        // 状態チェック: 停止または待機中なら終了
        if (this.state === InterpreterState.Halted) {
            break;
        }
        
        if (this.state === InterpreterState.WaitingForNextFrame) {
            // 次フレーム待機中なので、このyieldで制御を返す
            // 外部から resumeFromFrameWait() が呼ばれるまで実行しない
            yield;
            continue;
        }

        // 実行可能行の検索
        const executableLine = this.findNextExecutableLine(this.currentLineIndex);
        
        if (executableLine === -1) {
            this.state = InterpreterState.Halted;
            break;
        }

        this.currentLineIndex = executableLine;
        const line = this.program.body[this.currentLineIndex];

        // デバッグ処理（既存）
        // ...

        // ステートメント実行
        for (const statement of line.statements) {
            const result = this.executeStatement(statement);
            
            if (result.halt) {
                this.state = InterpreterState.Halted;
                return;
            }
            
            // 待機状態になった場合も中断
            if (this.state === InterpreterState.WaitingForNextFrame) {
                yield;
                continue;
            }
            
            if (result.jump) {
                break;
            }
        }

        // 次の行へ進む（ジャンプがなかった場合）
        if (this.state === InterpreterState.Running) {
            this.currentLineIndex++;
        }

        yield;
    }
}
```

### フェーズ2: マルチワーカー管理機構の実装

#### 2.1 WorkerManagerクラスの作成

**ファイル:** `src/realtime/WorkerManager.ts`

```typescript
import WorkerInterpreter from '../workerInterpreter.js';

/**
 * ワーカーのメタデータ
 */
interface WorkerInfo {
    id: string;
    interpreter: WorkerInterpreter;
    generator: Generator<void, void, unknown>;
    script: string;
}

/**
 * マルチワーカー実行管理クラス
 * 
 * 複数のワーカーインタプリタを管理し、正しい順序で実行する。
 * steps/frameの制御とフレーム境界の管理を担当。
 */
export class WorkerManager {
    private workers: WorkerInfo[] = [];
    private stepsPerFrame: number;
    
    constructor(config: { stepsPerFrame: number }) {
        this.stepsPerFrame = config.stepsPerFrame;
    }
    
    /**
     * ワーカーを追加
     */
    addWorker(id: string, interpreter: WorkerInterpreter, script: string): void {
        // スクリプトをロード
        interpreter.loadScript(script);
        
        // ジェネレーターを取得
        const generator = interpreter.run();
        
        // ワーカー情報を登録
        this.workers.push({
            id,
            interpreter,
            generator,
            script
        });
    }
    
    /**
     * 全ワーカーを削除
     */
    clearWorkers(): void {
        this.workers = [];
    }
    
    /**
     * 1フレーム分実行
     * 
     * 正しいインタリーブ実行を実現:
     * - steps/frame回のループ
     *   - 各ワーカーに対して1ステートメント実行を試行
     * 
     * @returns 実行継続可能かどうか（全ワーカーが停止した場合false）
     */
    executeFrame(): boolean {
        // フレーム開始時: 待機中のワーカーを再開
        for (const worker of this.workers) {
            worker.interpreter.resumeFromFrameWait();
        }
        
        // steps/frame回のステップ実行
        for (let step = 0; step < this.stepsPerFrame; step++) {
            let anyActive = false;
            
            // 全ワーカーを順番に実行
            for (const worker of this.workers) {
                if (worker.interpreter.canExecute()) {
                    // 1ステートメント実行
                    const result = worker.generator.next();
                    
                    if (!result.done) {
                        anyActive = true;
                    }
                }
            }
            
            // すべてのワーカーが実行不可（停止 or 待機）なら終了
            if (!anyActive) {
                break;
            }
        }
        
        // 少なくとも1つのワーカーがRunning状態なら継続
        return this.workers.some(w => 
            w.interpreter.getState() === 'running' ||
            w.interpreter.getState() === 'waiting'
        );
    }
    
    /**
     * 全ワーカーの状態を取得（デバッグ用）
     */
    getWorkersStatus(): Array<{ id: string; state: string }> {
        return this.workers.map(w => ({
            id: w.id,
            state: w.interpreter.getState()
        }));
    }
}
```

#### 2.2 RealTimeCLIRunnerの改修

**ファイル:** `src/realtime/RealTimeCLIRunner.ts`

現在のシングルワーカー実行から、WorkerManagerを使ったマルチワーカー実行に移行:

```typescript
import { WorkerManager } from './WorkerManager.js';

export class RealTimeCLIRunner {
    // 既存フィールド
    private config: RealTimeCLIRunnerConfig & { ... };
    private gridData: number[];
    // ...
    
    // 新規追加
    private workerManager: WorkerManager;
    
    constructor(config: RealTimeCLIRunnerConfig = {}) {
        // 既存の初期化
        // ...
        
        // WorkerManagerの初期化
        this.workerManager = new WorkerManager({
            stepsPerFrame: this.config.stepsPerFrame
        });
    }
    
    /**
     * シングルワーカー実行（後方互換用）
     */
    async executeRealTime(script: string, scriptName?: string): Promise<void> {
        // 既存の実装を維持しつつ、内部でWorkerManagerを使用
        this.workerManager.clearWorkers();
        
        const interpreter = new WorkerInterpreter({
            gridData: this.gridData,
            peekFn: (index: number) => this.peek(index),
            pokeFn: (x: number, y: number, value: number) => this.poke(x, y, value),
            logFn: (...args: any[]) => this.print(...args),
            getFn: () => this.keyboard.getKey(),
            putFn: (value: number) => this.put1Byte(value),
        });
        
        this.workerManager.addWorker('main', interpreter, script);
        
        // フレームループ実行
        await this.runFrameLoopWithManager();
    }
    
    /**
     * マルチワーカー実行（新規機能）
     */
    async executeMultiWorker(
        workers: Array<{ id: string; script: string }>,
        config?: { displayName?: string }
    ): Promise<void> {
        if (this.config.verbose) {
            this.println(`🎮 マルチワーカーモード起動: ${workers.length}ワーカー`);
        }
        
        this.workerManager.clearWorkers();
        
        // 各ワーカーのインタプリタを作成して登録
        for (const worker of workers) {
            const interpreter = new WorkerInterpreter({
                gridData: this.gridData,
                peekFn: (index: number) => this.peek(index),
                pokeFn: (x: number, y: number, value: number) => this.poke(x, y, value),
                logFn: (...args: any[]) => this.print(...args),
                getFn: () => this.keyboard.getKey(),
                putFn: (value: number) => this.put1Byte(value),
            });
            
            this.workerManager.addWorker(worker.id, interpreter, worker.script);
        }
        
        // フレームループ実行
        await this.runFrameLoopWithManager();
    }
    
    /**
     * WorkerManagerを使ったフレームループ
     */
    private async runFrameLoopWithManager(): Promise<void> {
        // グリッド表示の初期化（既存）
        // ...
        
        while (!this.shouldStop) {
            const frameStart = Date.now();
            
            // 1フレーム実行
            const canContinue = this.workerManager.executeFrame();
            
            if (!canContinue) {
                this.shouldStop = true;
                break;
            }
            
            this.frameCount++;
            
            // グリッド描画（既存）
            // ...
            
            // FPS表示（既存）
            // ...
            
            // フレームレート制御
            const elapsed = Date.now() - frameStart;
            const targetFrameTime = 1000 / this.config.frameRate;
            const delay = Math.max(0, targetFrameTime - elapsed);
            
            if (delay > 0) {
                await this.sleep(delay);
            }
        }
    }
    
    // 既存の runFrameLoop() メソッドは非推奨として残すか削除
}
```

### フェーズ3: CLIインターフェースの拡張

#### 3.1 コマンドラインオプションによる複数ワーカー指定

Web版との互換性を重視するため、各ワーカーは独立したファイルとして記述し、
コマンドラインオプション `-f` / `--file` で複数のworker scriptを指定できるようにします。

**実行例:**

```bash
# マルチワーカーモード: -f オプションで複数のスクリプトファイルを指定
npm run cli -- --real-time -f worker1.ws -f worker2.ws -f worker3.ws --steps 1000 --fps 30

# または --file でも同様
npm run cli -- --real-time --file worker1.ws --file worker2.ws --steps 1000

# シングルワーカーモード（既存の動作を維持）
npm run cli -- --real-time script.ws --steps 1000 --fps 30
```

#### 3.2 CLIコマンドの拡張

**ファイル:** `src/cli.ts`

コマンドライン引数のパース部分を拡張:

```typescript
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
    .name('workerscript')
    .description('WorkerScript CLI')
    .argument('[script]', 'スクリプトファイル（シングルワーカーモード）')
    .option('-f, --file <file>', 'ワーカースクリプトファイル（複数指定可）', (value, previous) => {
        return previous ? previous.concat([value]) : [value];
    }, undefined)
    .option('--real-time', 'リアルタイム実行モード')
    .option('--fps <number>', 'フレームレート', '30')
    .option('--steps <number>', 'フレームあたりのステップ数', '1000')
    .option('--show-fps', 'FPSを表示')
    .option('--show-grid', 'グリッドを表示')
    .option('--verbose', '詳細なログを表示')
    .action(async (scriptFile, options) => {
        // マルチワーカーモードのチェック
        const workerFiles: string[] = options.file || [];
        
        if (workerFiles.length > 0) {
            // マルチワーカーモード
            console.log(`🎮 マルチワーカーモード: ${workerFiles.length}個のワーカー`);
            
            // 各ワーカースクリプトを読み込み
            const workers = workerFiles.map((file, index) => {
                const script = fs.readFileSync(file, 'utf-8');
                const workerId = path.basename(file, path.extname(file));
                return { id: workerId, script };
            });
            
            const runner = new RealTimeCLIRunner({
                frameRate: parseInt(options.fps),
                stepsPerFrame: parseInt(options.steps),
                showFPS: options.showFps,
                showGrid: options.showGrid,
                verbose: options.verbose,
            });
            
            await runner.executeMultiWorker(workers, {
                displayName: workerFiles.join(', ')
            });
            
        } else if (scriptFile) {
            // シングルワーカーモード（既存）
            const script = fs.readFileSync(scriptFile, 'utf-8');
            
            const runner = new RealTimeCLIRunner({
                frameRate: parseInt(options.fps),
                stepsPerFrame: parseInt(options.steps),
                showFPS: options.showFps,
                showGrid: options.showGrid,
                verbose: options.verbose,
            });
            
            await runner.executeRealTime(script, scriptFile);
            
        } else {
            console.error('エラー: スクリプトファイルを指定してください');
            console.error('  シングルワーカー: npm run cli -- script.ws');
            console.error('  マルチワーカー: npm run cli -- -f worker1.ws -f worker2.ws');
            process.exit(1);
        }
    });

program.parse();
```

**設計の利点:**

1. **Web版との互換性**: 各ワーカーが独立したファイルとして存在するため、Web版でも同じファイル構成を使用できる
2. **ファイルの再利用**: 個別のワーカースクリプトを異なる組み合わせで実行可能
3. **段階的な開発**: ワーカーを1つずつ開発・テストし、後から組み合わせられる
4. **既存の動作を維持**: 引数でスクリプトを指定する従来の方法も継続サポート

### フェーズ4: テストとドキュメント

#### 4.1 ユニットテスト

**ファイル:** `src/__tests__/workerInterpreter.waitForNextFrame.test.ts`

```typescript
import WorkerInterpreter from '../workerInterpreter';

describe('WaitForNextFrame機能', () => {
    test('#=` で次フレーム待機状態になる', () => {
        const gridData = new Array(10000).fill(0);
        const interpreter = new WorkerInterpreter({
            gridData,
            peekFn: (i) => gridData[i],
            pokeFn: (x, y, v) => { gridData[y * 100 + x] = v; },
            logFn: () => {}
        });
        
        const script = `
            X=0
            #=\`
            X=1
        `;
        
        interpreter.loadScript(script);
        const gen = interpreter.run();
        
        // X=0 実行
        gen.next();
        expect(interpreter.getState()).toBe('running');
        
        // #=` 実行
        gen.next();
        expect(interpreter.getState()).toBe('waiting');
        
        // resumeFromFrameWait() で再開
        interpreter.resumeFromFrameWait();
        expect(interpreter.getState()).toBe('running');
        
        // X=1 実行可能
        gen.next();
    });
});
```

**ファイル:** `src/__tests__/realtime/WorkerManager.test.ts`

```typescript
import { WorkerManager } from '../../realtime/WorkerManager';
import WorkerInterpreter from '../../workerInterpreter';

describe('WorkerManager', () => {
    test('複数ワーカーのインタリーブ実行', () => {
        const gridData = new Array(10000).fill(0);
        const manager = new WorkerManager({ stepsPerFrame: 10 });
        
        // Worker A: X=0に1を書き込む
        const interpreterA = new WorkerInterpreter({
            gridData,
            peekFn: (i) => gridData[i],
            pokeFn: (x, y, v) => { gridData[y * 100 + x] = v; },
            logFn: () => {}
        });
        manager.addWorker('A', interpreterA, 'X=0 Y=0 `=1 #=`');
        
        // Worker B: X=0から読み取る（Aが書き込んだ後）
        const interpreterB = new WorkerInterpreter({
            gridData,
            peekFn: (i) => gridData[i],
            pokeFn: (x, y, v) => { gridData[y * 100 + x] = v; },
            logFn: () => {}
        });
        manager.addWorker('B', interpreterB, 'X=0 Y=0 Z=` #=`');
        
        // 1フレーム実行
        manager.executeFrame();
        
        // Worker BはWorker Aが書き込んだ値を読めるはず
        // （バッチ処理では不可能だったこと）
        expect(gridData[0]).toBe(1);
    });
});
```

#### 4.2 統合テスト

**ファイル:** `examples/multi-worker/writer.ws`

```workerscript
: グリッドに値を書き込むワーカー
X=10 Y=10
@=I,1,100
  `=I
  X=X+1
  #=`
#=@
#=-1
```

**ファイル:** `examples/multi-worker/reader.ws`

```workerscript
: 書き込まれた値を読み取るワーカー
X=10 Y=10
@=I,1,100
  A=`
  ?="Read: " ?=A /
  X=X+1
  #=`
#=@
#=-1
```

実行テスト:
```bash
npm run cli -- --real-time -f examples/multi-worker/writer.ws -f examples/multi-worker/reader.ws --steps 100
```

#### 4.3 ドキュメント更新

**ファイル:** `docs/worker.md`

セクション6.8「プログラム停止」の後に追加:

```markdown
### 6.9. フレーム待機

*   **命令:** `#` (システム変数)
*   **構文:** `#=` + バッククォート
*   **説明:** 現在のフレームの実行を終了し、次のフレームまで待機します。マルチワーカー環境で他のワーカーとの同期や、フレームごとの処理を実現するために使用します。
*   **例:** `#=\``
*   **用途:**
    *   アニメーションのフレーム制御
    *   他のワーカーがグリッドを更新するのを待つ
    *   CPU使用率の制御

**マルチワーカー環境での動作:**

マルチワーカーモードでは、複数のワーカーが同じグリッドを共有して実行されます。
各フレームで、すべてのワーカーが交互に1ステートメントずつ実行されるため、
ワーカー間でリアルタイムに相互作用できます。

```workerscript
: ワーカーA - 値を書き込む
@=(1)
    X=~%100
    Y=~%100
    `=255
    #=`  : フレーム終了、次フレームへ
#=@

: ワーカーB - 値を読み取る
@=(1)
    X=50
    Y=50
    A=`
    ?=A /
    #=`  : フレーム終了、次フレームへ
#=@
```
```

**ファイル:** `README.md`

マルチワーカー実行の説明を追加:

```markdown
### マルチワーカーモード

複数のワーカースクリプトを同時実行し、同じグリッド上で相互作用させることができます。

#### 実行方法

`-f` または `--file` オプションを複数回指定することで、複数のワーカースクリプトを実行できます。

```bash
# 3つのワーカーを同時実行
npm run cli -- --real-time -f worker1.ws -f worker2.ws -f worker3.ws --steps 1000 --fps 30

# または --file でも同様
npm run cli -- --real-time --file worker1.ws --file worker2.ws --steps 1000
```

#### ワーカースクリプトの記述

各ワーカーは独立した `.ws` ファイルとして記述します。Web版との互換性を保つため、
各ワーカーは個別のファイルとして管理されます。

**worker1.ws:**
```workerscript
: Worker 1 - 値を書き込む
X=0 Y=0
@=I,1,100
  `=~%256
  X=X+1
  #=`
#=@
#=-1
```

**worker2.ws:**
```workerscript
: Worker 2 - 値を読み取る
X=0 Y=0
@=I,1,100
  A=`
  ?=A /
  X=X+1
  #=`
#=@
#=-1
```

#### フレーム待機（#=`）

各ワーカーは `#=\`` を使って現在のフレームの実行を終了し、次のフレームまで待機できます。
これにより、全ワーカーが協調して動作するアニメーションやシミュレーションが実現できます。

#### Web版との互換性

コマンドラインで `-f` オプションで指定するワーカースクリプトは、Web版でも
同じファイルをそのまま使用できます。各ワーカーが独立したファイルとして存在するため、
開発・テスト・デプロイの各段階で一貫性が保たれます。
```

## 実装の優先順位と段階的ロールアウト

### ステップ1: 基本機能実装（必須）
1. `InterpreterState` の追加とメソッド実装
2. `#=\`` 文法のパーサー対応
3. `WaitForNextFrameStatement` の実行処理
4. `WorkerManager` クラスの実装
5. 基本的なユニットテスト

### ステップ2: 統合（必須）
1. `RealTimeCLIRunner` の `WorkerManager` 統合
2. シングルワーカーモードの動作確認（後方互換性）
3. 簡単なマルチワーカーテストスクリプトでの動作確認

### ステップ3: マルチワーカー機能（拡張）
1. CLI引数の拡張（`-f` / `--file` オプションの複数指定対応）
2. マルチワーカー実行の統合テスト
3. サンプルワーカースクリプトの作成

### ステップ4: ドキュメントと例（完成）
1. `worker.md` の更新
2. `README.md` の更新
3. サンプルスクリプト（examples/）の作成
4. チュートリアルの作成

## 実装時の注意事項

### 状態管理の一貫性

1. **インタプリタの状態は3つだけ**
   - Running: 通常実行
   - Halted: 停止（`#=-1`）
   - WaitingForNextFrame: 次フレーム待機（`#=\``）

2. **状態遷移は明確に**
   ```
   Running -> Halted (by #=-1, never returns)
   Running -> WaitingForNextFrame (by #=`)
   WaitingForNextFrame -> Running (by resumeFromFrameWait())
   ```

3. **ワーカー管理側はインタプリタの状態を読むだけ**
   - 状態を直接変更しない
   - `resumeFromFrameWait()` だけが例外（フレーム開始時の復帰）

### パフォーマンス考慮

1. **steps/frameの意味が変わる**
   - 従来: 1ワーカーあたりのステップ数
   - 新方式: 全ワーカー合計のステップ数
   - 同じパフォーマンスを得るには: `steps/frame × ワーカー数` に設定

2. **オーバーヘッドの最小化**
   - `canExecute()` チェックは軽量に
   - 状態フラグのチェックのみ（計算なし）

### 後方互換性

1. **既存のシングルワーカースクリプトは完全互換**
   - `#=\`` を使わなければ従来通り動作
   - WorkerManagerは1ワーカーでも正しく動作

2. **段階的な移行を可能に**
   - シングルワーカーモードは維持
   - マルチワーカーモードは新しいコマンドオプションで起動

## 検証計画

### 機能検証

1. **基本機能**
   - [ ] `#=\`` でWaitingForNextFrame状態になる
   - [ ] `resumeFromFrameWait()` でRunning状態に戻る
   - [ ] `canExecute()` が状態に応じて正しく動作

2. **マルチワーカー実行**
   - [ ] 複数ワーカーが交互に実行される
   - [ ] ワーカー間でグリッドの更新が即座に反映される
   - [ ] 1フレームあたりsteps/frame回のステップが実行される

3. **後方互換性**
   - [ ] 既存のスクリプトが変更なしで動作
   - [ ] シングルワーカーモードの動作が変わらない

### パフォーマンス検証

1. **実行速度**
   - [ ] シングルワーカーでのオーバーヘッドが5%未満
   - [ ] マルチワーカー（3つ）でも目標FPSを維持

2. **メモリ使用量**
   - [ ] ワーカー数に比例した増加のみ
   - [ ] メモリリークなし

### ストレステスト

1. **多数のワーカー**
   - 10ワーカーでの動作確認
   - 100ワーカーでの限界テスト

2. **長時間実行**
   - 1時間連続実行でのメモリリーク確認
   - CPU使用率の安定性確認

## 既知の制限事項と今後の拡張

### 現在の制限

1. **ワーカー間通信は共有グリッドのみ**
   - 直接的なメッセージパッシングはサポートしない
   - グリッドのセルを使った間接的な通信が必要

2. **ワーカーの動的追加/削除は未サポート**
   - 実行開始時に全ワーカーを登録
   - 実行中の追加/削除は不可

3. **ワーカー間の実行順序は固定**
   - 登録順に実行される
   - 優先度制御なし

### 将来の拡張可能性

1. **ワーカー間メッセージング**
   - 専用のメッセージキュー変数
   - イベント駆動型の実行モデル

2. **ワーカープール**
   - 動的なワーカー生成/破棄
   - リソース管理

3. **デバッグ機能の強化**
   - ワーカーごとのブレークポイント
   - ワーカー間の相互作用の可視化

## まとめ

本実装計画により、以下が達成されます:

1. ✅ **真のマルチワーカー実行**: バッチ処理からインタリーブ実行へ
2. ✅ **リアルタイム相互作用**: ワーカー間でグリッドの変更が即座に反映
3. ✅ **シンプルな状態管理**: インタプリタは3つの状態のみを管理
4. ✅ **一貫性のある設計**: 制御フローは`#`への代入で統一
5. ✅ **後方互換性**: 既存のスクリプトは変更なしで動作
6. ✅ **段階的な実装**: 各フェーズを独立してテスト可能

この設計により、WorkerScriptの理念である「グリッド上での相互作用を楽しむ砂場遊び」が真に実現されます。
