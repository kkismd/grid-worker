# Steps/Frame 正しい駆動方式への修正 - 実装計画

## 概要

現在のワーカー実行方式を、バッチ処理方式から真のマルチワーカー並行実行方式に変更する。
これにより、複数のワーカーがグリッドを共有してリアルタイムに相互作用できるようになる。

## 問題の詳細分析

### 現在の実装 (src/index.ts)

```typescript
function executeGlobalStep() {
    workers.forEach((worker) => {
        if (worker.status !== 'running' || !worker.generator) return;
        
        // 問題: 各ワーカーがstepsPerFrame回連続実行
        for (let i = 0; i < currentStepsPerFrame; i++) {
            const result = worker.generator.next();
            worker.stepCount++;
            
            if (result.done) {
                worker.status = 'stopped';
                break;
            }
        }
    });
}
```

### 問題点
1. Worker A が 1000 ステップ実行 → Worker B が 1000 ステップ実行 → ...
2. Worker A の実行結果を Worker B がすぐに参照できない
3. フレーム内での相互作用が発生しない

## 実装計画

### フェーズ1: ワーカー実行ロジックの修正（Web版）

#### 1.1 src/index.ts の executeGlobalStep() を修正

**修正前:**
```typescript
function executeGlobalStep() {
    workers.forEach((worker) => {
        if (worker.status !== 'running') return;
        for (let i = 0; i < currentStepsPerFrame; i++) {
            worker.generator.next();
        }
    });
}
```

**修正後:**
```typescript
function executeGlobalStep() {
    // steps/frame の回数だけステップを実行
    for (let step = 0; step < currentStepsPerFrame; step++) {
        // 各ステップで全ワーカーを順に1ステートメント実行
        workers.forEach((worker) => {
            if (worker.status !== 'running' || !worker.generator) return;
            
            // 「次フレームまで待機」状態をチェック
            if (worker.waitingForNextFrame) {
                return; // このフレームでは何もしない
            }
            
            try {
                const result = worker.generator.next();
                worker.stepCount++;
                
                if (result.done) {
                    worker.status = 'stopped';
                    updateWorkerStatus(worker.id);
                    logSystem(`Worker ${worker.id} completed.`);
                }
            } catch (error) {
                worker.status = 'stopped';
                updateWorkerStatus(worker.id);
                logSystem(`Worker ${worker.id} error: ${error.message}`);
            }
        });
    }
    
    // フレーム終了時に全ワーカーの待機状態をクリア
    workers.forEach((worker) => {
        worker.waitingForNextFrame = false;
    });
    
    // ワーカー状態を一括更新
    workers.forEach((worker) => {
        if (worker.status === 'running') {
            updateWorkerStatus(worker.id);
        }
    });
    
    // アクティブなワーカーがなければグローバルループを停止
    const hasActiveWorkers = Array.from(workers.values())
        .some(w => w.status === 'running');
    if (!hasActiveWorkers) {
        stopGlobalExecution();
    }
}
```

#### 1.2 Worker インターフェースの拡張

```typescript
interface Worker {
    id: number;
    interpreter: WorkerInterpreter | null;
    generator: Generator<void, void, unknown> | null;
    status: 'stopped' | 'running' | 'paused';
    stepCount: number;
    waitingForNextFrame: boolean; // 追加
}
```

### フェーズ2: 「次フレームまで待機」命令の実装

#### 2.1 新しいステートメントの追加

**文法:** `#=`` ` `` (システム変数#にバッククォートを代入)

**意味:** 現在のフレームでの実行を終了し、次フレームまで待機する

#### 2.2 AST定義の追加 (src/ast.ts)

```typescript
export interface WaitFrameStatement {
    type: 'WaitFrameStatement';
}
```

#### 2.3 パーサーの拡張 (src/parser.ts)

AssignmentStatement の解析時に `#=` `` ` `` パターンを検出:

```typescript
private parseAssignmentStatement(target: string, tokens: Token[]): Statement {
    // ... 既存のコード ...
    
    // #=` の場合は WaitFrameStatement
    if (target === '#' && tokens[index].type === 'BACKTICK') {
        return {
            type: 'WaitFrameStatement'
        } as WaitFrameStatement;
    }
    
    // ... 既存のコード ...
}
```

#### 2.4 インタプリタの拡張 (src/workerInterpreter.ts)

```typescript
class WorkerInterpreter {
    private waitingForNextFrame: boolean = false;
    
    // ステートメント実行関数の追加
    private executeWaitFrame(statement: WaitFrameStatement): ExecutionResult {
        this.waitingForNextFrame = true;
        return { jump: false, halt: false };
    }
    
    // 実行ループでの待機状態チェック
    *run(): Generator<void, void, unknown> {
        while (this.currentLineIndex < this.program.body.length) {
            // フレーム待機状態なら yield して制御を返す
            if (this.waitingForNextFrame) {
                yield;
                continue; // 次の呼び出しまで待機
            }
            
            // 通常のステートメント実行
            // ...
        }
    }
    
    // 外部から待機状態をクリアするメソッド
    clearFrameWait(): void {
        this.waitingForNextFrame = false;
    }
}
```

#### 2.5 フレームループとの統合

Web版 (src/index.ts):
```typescript
function executeGlobalStep() {
    for (let step = 0; step < currentStepsPerFrame; step++) {
        workers.forEach((worker) => {
            if (!worker.interpreter) return;
            
            // インタプリタの待機状態をチェック
            if (worker.interpreter.isWaitingForNextFrame()) {
                return;
            }
            
            // 1ステートメント実行
            worker.generator.next();
        });
    }
    
    // フレーム終了時に全インタプリタの待機をクリア
    workers.forEach((worker) => {
        worker.interpreter?.clearFrameWait();
    });
}
```

CLI版 (src/realtime/RealTimeCLIRunner.ts):
```typescript
private async runFrameLoop(generator: Generator): Promise<void> {
    while (!this.shouldStop) {
        const frameStart = Date.now();
        
        // フレーム開始時に待機状態をクリア
        this.interpreter.clearFrameWait();
        
        // 1フレーム分実行
        for (let i = 0; i < this.config.stepsPerFrame; i++) {
            // 待機状態ならスキップ
            if (this.interpreter.isWaitingForNextFrame()) {
                break;
            }
            
            const result = generator.next();
            this.totalSteps++;
            
            if (result.done) {
                this.shouldStop = true;
                break;
            }
        }
        
        // フレームレート制御
        // ...
    }
}
```

### フェーズ3: ドキュメント更新

#### 3.1 docs/worker.md の更新

新しい制御フロー命令として `#=`` ` `` を追加:

```markdown
### 6.4. 制御フロー（統一構文）

*   **GOTO:** システム変数 `#` を使用してラベルにジャンプします。
    *   **構文:** `#=^<ラベル>`
*   **GOSUB:** システム変数 `!` を使用してサブルーチンにジャンプします。
    *   **構文:** `!=^<ラベル>`
*   **RETURN:** サブルーチンから戻ります。
    *   **構文:** `#=!`
*   **WAIT FRAME:** 次のフレームまで実行を待機します。
    *   **構文:** `#=`` ` ``
    *   **説明:** 現在のフレームでの実行を終了し、次のフレームの開始まで待機します。
                 マルチワーカー環境で、他のワーカーとの同期を取るために使用します。
*   **HALT:** プログラムの実行を停止します。
    *   **構文:** `#=-1`
```

### フェーズ4: テストの追加

#### 4.1 ユニットテスト (src/__tests__/workerInterpreter.test.ts)

```typescript
describe('WaitFrame Statement', () => {
    test('should pause execution until next frame', () => {
        const script = `
            X=0
            ^LOOP
                X=X+1
                #=\`
                #=^LOOP
        `;
        
        const interpreter = new WorkerInterpreter({...});
        interpreter.loadScript(script);
        const gen = interpreter.run();
        
        // 1ステップ実行: X=0
        gen.next();
        expect(interpreter.getVariable('X')).toBe(0);
        
        // 2ステップ実行: X=X+1
        gen.next();
        expect(interpreter.getVariable('X')).toBe(1);
        
        // 3ステップ実行: #=`
        gen.next();
        expect(interpreter.isWaitingForNextFrame()).toBe(true);
        
        // 待機状態では次のステートメントは実行されない
        gen.next();
        expect(interpreter.getVariable('X')).toBe(1);
        
        // フレーム待機をクリア
        interpreter.clearFrameWait();
        gen.next(); // #=^LOOP
        gen.next(); // X=X+1
        expect(interpreter.getVariable('X')).toBe(2);
    });
});
```

#### 4.2 統合テスト - マルチワーカー相互作用

2つのワーカーがグリッドを介して相互作用するシナリオ:

```typescript
test('multiple workers interact in real-time', () => {
    const gridData = new Array(10000).fill(0);
    
    // Worker 1: X座標にカウンタを書き込む
    const script1 = `
        X=0 Y=0
        C=0
        ^LOOP
            \`=C
            C=C+1
            #=\`
            #=^LOOP
    `;
    
    // Worker 2: 同じ位置から読み取り
    const script2 = `
        X=0 Y=0
        ^LOOP
            V=\`
            ?=V
            /
            #=\`
            #=^LOOP
    `;
    
    // 両方のワーカーを起動し、フレームごとに実行
    // Worker 1 が書き込んだ値を Worker 2 がすぐに読み取れることを検証
});
```

## 実装の順序

1. **フェーズ1（Web版のワーカーループ修正）** - 最優先
   - 既存機能に影響を与えずに実装可能
   - マルチワーカーの相互作用を即座に改善

2. **フェーズ2（#=` 命令の追加）** - 2番目
   - パーサー、AST、インタプリタの拡張
   - テストを書いて動作検証

3. **フェーズ3（ドキュメント更新）** - 3番目
   - worker.md に新機能を追加

4. **フェーズ4（テスト追加）** - 最後
   - 包括的なテストスイートの作成

## リスク評価

### 低リスク
- フェーズ1: 実行順序の変更のみ、既存のAPIは変更なし

### 中リスク
- フェーズ2: 新しいステートメント型の追加
  - パーサーとインタプリタの変更が必要
  - 既存の `#=` 系統の命令との整合性を保つ必要

### 軽減策
- 各フェーズごとにテストを実行
- パーサーの変更は既存のテストでカバー
- 新機能は既存機能に影響を与えない（オプトイン）

## 成功基準

1. 複数ワーカーが1フレーム内で順番に実行されること
2. あるワーカーがグリッドに書き込んだ値を、同じフレーム内の別のワーカーが読み取れること
3. `#=`` ` `` 命令により、ワーカーがフレーム境界で待機できること
4. 既存のスクリプトが引き続き動作すること（後方互換性）
5. テストが全てパスすること

## 参考資料

- docs/worker.md - WorkerScript言語仕様
- src/index.ts - Web版メインファイル
- src/realtime/RealTimeCLIRunner.ts - CLI版リアルタイム実行
- src/workerInterpreter.ts - インタプリタ実装
