# Steps/Frame 機能の技術仕様

## 背景

WorkerScriptは、複数のワーカーがグリッドという共有メモリ空間で相互作用する「砂場遊び」を提供するシステムです。しかし、現在の実装では各ワーカーが順番にバッチ実行されるため、リアルタイムな相互作用が実現できていません。

## 目標

1フレーム内で全てのワーカーが交互に1ステートメントずつ実行されることで、真のマルチワーカー並行実行を実現する。

## 用語定義

- **フレーム**: 画面が更新される1単位（通常 1/60秒 = 16.67ms）
- **ステップ**: 1つのステートメント実行
- **steps/frame**: 1フレーム内で実行される総ステップ数
- **ワーカー**: 独立したスクリプト実行コンテキスト

## 実行モデル

### 現在の実装（バッチモード）

```
Frame 1:
  Worker A: 1000 steps
  Worker B: 1000 steps
  Worker C: 1000 steps
  → Grid Updated

Frame 2:
  Worker A: 1000 steps
  Worker B: 1000 steps
  Worker C: 1000 steps
  → Grid Updated
```

**問題点:**
- Worker A の実行が完全に終わるまで Worker B は実行されない
- 同一フレーム内での相互作用が不可能
- Worker A が書き込んだ値を Worker B が参照できるのは次のフレーム

### 新しい実装（インターリーブモード）

```
Frame 1:
  Step 1: Worker A (1 statement)
  Step 2: Worker B (1 statement)
  Step 3: Worker C (1 statement)
  Step 4: Worker A (1 statement)
  Step 5: Worker B (1 statement)
  ...
  Step 1000: ...
  → Grid Updated

Frame 2:
  Step 1: Worker A (1 statement)
  Step 2: Worker B (1 statement)
  ...
```

**利点:**
- 各ワーカーがフレーム内で順番に実行される
- Worker A が書き込んだ値を同じフレーム内で Worker B が参照可能
- 真の並行実行による相互作用

## コード実装の詳細

### 1. Web版の実行ループ (src/index.ts)

#### 変更前
```typescript
function executeGlobalStep() {
    workers.forEach((worker) => {
        if (worker.status !== 'running' || !worker.generator) return;
        
        // 各ワーカーがstepsPerFrame回連続実行（問題）
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

#### 変更後
```typescript
function executeGlobalStep() {
    // 外側のループ: ステップ数
    for (let step = 0; step < currentStepsPerFrame; step++) {
        // 内側のループ: 全ワーカー
        workers.forEach((worker) => {
            if (worker.status !== 'running' || !worker.generator) return;
            
            // 待機状態チェック（将来の拡張用）
            if (worker.waitingForNextFrame) {
                return;
            }
            
            // 1ステートメントだけ実行
            try {
                const result = worker.generator.next();
                worker.stepCount++;
                
                if (result.done) {
                    worker.status = 'stopped';
                }
            } catch (error) {
                worker.status = 'stopped';
                logSystem(`Worker ${worker.id} error: ${error.message}`);
            }
        });
    }
    
    // フレーム終了処理
    workers.forEach((worker) => {
        worker.waitingForNextFrame = false;
        if (worker.status === 'running') {
            updateWorkerStatus(worker.id);
        }
    });
    
    // アクティブなワーカーが無ければ停止
    const hasActiveWorkers = Array.from(workers.values())
        .some(w => w.status === 'running');
    if (!hasActiveWorkers) {
        stopGlobalExecution();
    }
}
```

### 2. CLI版の実行ループ (src/realtime/RealTimeCLIRunner.ts)

CLI版は単一ワーカーのため、構造的な変更は不要ですが、将来のマルチワーカー対応に備えて `#=`` ` `` 命令のサポートを追加します。

```typescript
private async runFrameLoop(generator: Generator): Promise<void> {
    while (!this.shouldStop) {
        const frameStart = Date.now();
        
        // フレーム開始時に待機状態をクリア
        if (this.interpreter) {
            this.interpreter.clearFrameWait();
        }
        
        // 1フレーム分実行
        for (let i = 0; i < this.config.stepsPerFrame; i++) {
            // 待機状態チェック
            if (this.interpreter?.isWaitingForNextFrame()) {
                break; // このフレームは終了
            }
            
            const result = generator.next();
            this.totalSteps++;
            
            if (result.done) {
                this.shouldStop = true;
                break;
            }
        }
        
        // グリッド描画、FPS表示、フレームレート制御...
    }
}
```

### 3. 新しい制御命令: #=`` ` ``

#### 構文
```workerscript
#=`
```

#### 意味
現在のフレームでの実行を終了し、次のフレームまで待機する。

#### 使用例

**例1: アニメーションループ**
```workerscript
X=0 Y=0
C=0

^LOOP
    : カウンタをグリッドに描画
    `=C
    C=C+1
    
    : 次のフレームまで待機
    #=`
    
    #=^LOOP
```

このスクリプトは毎フレーム1回だけカウンタを増やし、グリッドに書き込みます。

**例2: マルチワーカー同期**
```workerscript
: Worker 1
X=0 Y=0
^LOOP
    V=`
    V=V+1
    `=V
    #=`
    #=^LOOP
```

```workerscript
: Worker 2
X=0 Y=0
^LOOP
    V=`
    ?=V
    /
    #=`
    #=^LOOP
```

Worker 1 が値を更新し、Worker 2 がそれを表示する。フレームごとに同期される。

#### インタプリタの状態管理

```typescript
class WorkerInterpreter {
    private waitingForNextFrame: boolean = false;
    
    // 待機状態を設定
    private executeWaitFrame(statement: WaitFrameStatement): ExecutionResult {
        this.waitingForNextFrame = true;
        return { jump: false, halt: false };
    }
    
    // 待機状態を確認
    isWaitingForNextFrame(): boolean {
        return this.waitingForNextFrame;
    }
    
    // 待機状態をクリア（フレーム開始時に呼ばれる）
    clearFrameWait(): void {
        this.waitingForNextFrame = false;
    }
    
    // 実行ジェネレーター
    *run(): Generator<void, void, unknown> {
        while (this.currentLineIndex < this.program.body.length) {
            // 待機中は何もせずyield
            if (this.waitingForNextFrame) {
                yield;
                continue;
            }
            
            // 通常のステートメント実行
            const statement = this.getCurrentStatement();
            const result = this.executeStatement(statement);
            
            if (result.halt) {
                return;
            }
            
            yield;
        }
    }
}
```

## パフォーマンスへの影響

### 理論的な影響

- **変更前:** N個のワーカー × S個のステップ = N×S 回のループ
- **変更後:** S個のステップ × N個のワーカー = S×N 回のループ

ループの総回数は同じですが、内側と外側を入れ替えるため、キャッシュ効率がわずかに変わる可能性があります。

### 実測による検証

実装後、以下のシナリオでパフォーマンスを測定:
1. 1ワーカー × 10000 steps/frame
2. 10ワーカー × 1000 steps/frame
3. 100ワーカー × 100 steps/frame

### 予想されるオーバーヘッド

- 各ステップごとにワーカーリストをイテレート: **無視できるレベル**
- ステータスチェックの増加: **最小限**
- 待機状態チェック: **O(1) の単純な真偽値チェック**

## 後方互換性

### 既存スクリプトへの影響

- **影響なし**: 既存のスクリプトは `#=`` ` `` を使用していないため、動作は変わりません
- **実行順序の変化**: マルチワーカー環境では実行順序が変わりますが、これは意図した改善です
- **単一ワーカー**: CLI版などの単一ワーカー環境では実質的に影響なし

### 段階的な移行

1. フェーズ1で実行順序のみ変更（既存機能を維持）
2. フェーズ2で新命令を追加（オプトイン）
3. 既存のスクリプトは自然に動作し続ける

## セキュリティ考慮事項

- 無限ループの防止: 既存のステップ制限がそのまま機能
- DoS攻撃: フレームレート制限により緩和
- メモリリーク: ワーカーごとに独立したメモリ空間

## テスト戦略

### 単体テスト
- `#=`` ` `` 命令のパース
- インタプリタの待機状態管理
- フレームループの正しい動作

### 統合テスト
- 2ワーカーの相互作用
- 10ワーカーの並行実行
- グリッド更新の可視性

### パフォーマンステスト
- 1000 steps/frame × 10 workers
- FPSの安定性
- CPU使用率

## 実装チェックリスト

- [ ] Worker インターフェースに `waitingForNextFrame` を追加
- [ ] executeGlobalStep() のループを反転
- [ ] フレーム終了処理を追加
- [ ] AST に WaitFrameStatement を追加
- [ ] パーサーで `#=`` ` `` をパース
- [ ] インタプリタに待機状態管理を追加
- [ ] 単体テストを作成
- [ ] 統合テストを作成
- [ ] docs/worker.md を更新
- [ ] パフォーマンステストを実行

## 参考文献

- [VTL言語仕様](https://en.wikipedia.org/wiki/VTL-2)
- [協調的マルチタスキング](https://en.wikipedia.org/wiki/Cooperative_multitasking)
- docs/worker.md - WorkerScript言語仕様
