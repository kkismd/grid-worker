# I/O文実行スキップ問題の調査報告書

## 問題の概要

**issue**: steps per frameを大きく設定した場合、gridData（グリッド）への書き込み（POKEなどのI/O操作）が即座に反映されない問題

現在の実装では、実行ループ内で複数のステップを連続実行する際、gridDataへの書き込み（`poke()`関数経由）は内部のgridData配列には即座に反映されるが、画面への再描画は1フレームの全ステップ実行が完了した後に一度だけ行われる。

これにより、steps per frameが大きい（例: 10000, 100000）場合、グリッド更新の視覚的フィードバックが遅延し、リアルタイム性が損なわれる。

## 影響範囲

### 1. Web版 (`src/index.ts`)

#### 現在の実装

```typescript
// 行238-276: executeGlobalStep()関数
function executeGlobalStep() {
    let hasActiveWorkers = false;
    
    workers.forEach((worker) => {
        if (worker.status !== 'running' || !worker.generator) return;
        hasActiveWorkers = true;
        
        try {
            // Execute multiple steps per frame based on speed setting
            for (let i = 0; i < currentStepsPerFrame; i++) {
                const result = worker.generator.next();
                worker.stepCount++;
                
                if (result.done) {
                    worker.status = 'stopped';
                    updateWorkerStatus(worker.id);
                    logSystem(`Worker ${worker.id} completed.`);
                    break;
                }
            }
            
            updateWorkerStatus(worker.id);
        } catch (error) {
            // エラーハンドリング
        }
    });
    
    // Stop global loop if no active workers
    if (!hasActiveWorkers) {
        stopGlobalExecution();
    }
}
```

**問題点**:
- `for (let i = 0; i < currentStepsPerFrame; i++)` ループ内で複数ステップを連続実行
- `poke(x, y, value)` 関数は `gridData[index] = value` と `drawCell(index)` を呼ぶ（行109-123）
- `drawCell()` は個別セルを再描画するが、ループ内での頻繁な呼び出しは非効率
- グリッド更新は各ステップで発生するが、ステップ数が多いとフレーム内での更新回数も多くなる

#### poke関数の実装（行109-123）

```typescript
function poke(x: number, y: number, value: number): void {
    // X, Yを0-99に正規化
    const xMod = ((Math.floor(x) % 100) + 100) % 100;
    const yMod = ((Math.floor(y) % 100) + 100) % 100;
    const index = xMod * 100 + yMod;
    
    if (index < 0 || index >= GRID_AREA) {
        return; // 範囲外は無視
    }
    
    // 値を0-255にクランプ
    const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
    gridData[index] = clampedValue;
    drawCell(index);  // ←毎回再描画している
}
```

### 2. Realtime版 (`src/realtime/RealTimeCLIRunner.ts`)

#### 現在の実装

```typescript
// 行211-274: runFrameLoop()関数
private async runFrameLoop(generator: Generator): Promise<void> {
    while (!this.shouldStop) {
        const frameStart = Date.now();
        
        // 1フレーム分実行（ステップ制限なし）
        for (let i = 0; i < this.config.stepsPerFrame; i++) {
            const result = generator.next();
            this.totalSteps++;
            
            if (result.done) {
                this.shouldStop = true;
                break;
            }
        }
        
        this.frameCount++;

        // グリッド差分描画
        if (this.config.showGrid) {
            if (this.config.splitScreen && this.splitScreenRenderer) {
                const currentGrid = this.getCurrentGridData();
                const diffOutput = this.splitScreenRenderer.updateGrid(this.lastGridData, currentGrid);
                if (diffOutput) {
                    process.stdout.write(diffOutput);
                }
                this.lastGridData = currentGrid;
            } else if (this.config.characterMode) {
                const diffOutput = this.charVRAMRenderer.renderDiff(this.gridData);
                if (diffOutput) {
                    process.stdout.write(diffOutput);
                }
            } else {
                const diffOutput = this.gridDiffRenderer.renderDiff(this.gridData);
                if (diffOutput) {
                    process.stdout.write(diffOutput);
                }
            }
        }
        
        // フレームレート制御
        // ...
    }
}
```

**問題点**:
- `for (let i = 0; i < this.config.stepsPerFrame; i++)` ループで全ステップを実行
- グリッド差分描画は**フレーム完了後に1回だけ**実行される
- steps per frameが大きい場合、多数のPOKE操作がバッファリングされ、最終状態のみが描画される
- 中間状態の可視化が失われる

#### poke関数の実装（行312-324）

```typescript
private poke(x: number, y: number, value: number): void {
    // X, Y を 0-99 の範囲にラップ
    const wrappedX = ((x % 100) + 100) % 100;
    const wrappedY = ((y % 100) + 100) % 100;
    const index = wrappedY * 100 + wrappedX;
    
    if (index >= 0 && index < this.gridData.length) {
        this.gridData[index] = value;  // ←gridDataは更新されるが描画は後
    }
}
```

## 修正方針

### 目標
steps per frameの値に関わらず、gridDataへの書き込みが発生した際に視覚的に反映されるようにする。ただし、パフォーマンスを考慮し、過度な再描画は避ける。

### アプローチ1: 適応的な描画頻度制御（推奨）

**概要**: ステップ実行ループ内に描画チェックポイントを設けて、一定ステップごとまたは一定時間ごとにグリッド更新を行う。

#### Web版の修正案

```typescript
function executeGlobalStep() {
    let hasActiveWorkers = false;
    const DRAW_INTERVAL = 100; // 100ステップごとに描画
    
    workers.forEach((worker) => {
        if (worker.status !== 'running' || !worker.generator) return;
        hasActiveWorkers = true;
        
        try {
            for (let i = 0; i < currentStepsPerFrame; i++) {
                const result = worker.generator.next();
                worker.stepCount++;
                
                if (result.done) {
                    worker.status = 'stopped';
                    updateWorkerStatus(worker.id);
                    logSystem(`Worker ${worker.id} completed.`);
                    break;
                }
                
                // 適応的な描画: 一定ステップごとにチェック
                if ((i + 1) % DRAW_INTERVAL === 0) {
                    // gridDataの変更を反映（必要に応じて）
                    // 実装方法については「修正の詳細」を参照
                }
            }
            
            updateWorkerStatus(worker.id);
        } catch (error) {
            // エラーハンドリング
        }
    });
    
    if (!hasActiveWorkers) {
        stopGlobalExecution();
    }
}
```

#### Realtime版の修正案

```typescript
private async runFrameLoop(generator: Generator): Promise<void> {
    const DRAW_INTERVAL = 100; // 100ステップごとに描画
    
    while (!this.shouldStop) {
        const frameStart = Date.now();
        
        for (let i = 0; i < this.config.stepsPerFrame; i++) {
            const result = generator.next();
            this.totalSteps++;
            
            if (result.done) {
                this.shouldStop = true;
                break;
            }
            
            // 適応的な描画: 一定ステップごとにチェック
            if ((i + 1) % DRAW_INTERVAL === 0 && this.config.showGrid) {
                // グリッド差分描画を実行
                await this.renderGridUpdate();
            }
        }
        
        this.frameCount++;

        // フレーム終了時の最終描画
        if (this.config.showGrid) {
            await this.renderGridUpdate();
        }
        
        // フレームレート制御
        const elapsed = Date.now() - frameStart;
        const targetFrameTime = 1000 / this.config.frameRate;
        const delay = Math.max(0, targetFrameTime - elapsed);
        
        if (delay > 0) {
            await this.sleep(delay);
        }
    }
}

// 新規ヘルパーメソッド
private async renderGridUpdate(): Promise<void> {
    if (this.config.splitScreen && this.splitScreenRenderer) {
        const currentGrid = this.getCurrentGridData();
        const diffOutput = this.splitScreenRenderer.updateGrid(this.lastGridData, currentGrid);
        if (diffOutput) {
            process.stdout.write(diffOutput);
        }
        this.lastGridData = currentGrid;
    } else if (this.config.characterMode) {
        const diffOutput = this.charVRAMRenderer.renderDiff(this.gridData);
        if (diffOutput) {
            process.stdout.write(diffOutput);
        }
    } else {
        const diffOutput = this.gridDiffRenderer.renderDiff(this.gridData);
        if (diffOutput) {
            process.stdout.write(diffOutput);
        }
    }
}
```

### アプローチ2: Dirty フラグ方式

**概要**: `poke()` 関数でgridDataへの書き込みが発生したことを記録し、ループ内で定期的にdirtyフラグをチェックして描画する。

#### 実装の流れ

1. グローバルまたはクラスレベルで `dirtyFlags: Set<number>` を管理
2. `poke()` 関数内で更新されたインデックスを `dirtyFlags` に追加
3. ステップ実行ループ内で定期的に `dirtyFlags` をチェック
4. フラグが立っているセル/領域のみを再描画

**メリット**:
- 更新されたセルのみを効率的に再描画
- 細かい制御が可能

**デメリット**:
- 実装がやや複雑
- 状態管理のオーバーヘッド

### アプローチ3: 時間ベースの描画制御

**概要**: 最後の描画からの経過時間を監視し、一定時間（例: 50ms）ごとに描画を実行する。

#### 実装例

```typescript
let lastDrawTime = Date.now();
const DRAW_THROTTLE_MS = 50; // 50msごとに描画

for (let i = 0; i < currentStepsPerFrame; i++) {
    const result = worker.generator.next();
    worker.stepCount++;
    
    if (result.done) break;
    
    // 時間ベースの描画
    const now = Date.now();
    if (now - lastDrawTime >= DRAW_THROTTLE_MS) {
        // 描画処理
        lastDrawTime = now;
    }
}
```

**メリット**:
- フレームレートに依存しない描画頻度
- ユーザー体験の向上

**デメリット**:
- 時間測定のオーバーヘッド
- 非決定的な描画タイミング

## 修正の詳細

### 推奨される実装手順

#### Web版 (`src/index.ts`)

1. **poke関数の修正**: 即座の描画を削除し、dirtyフラグを設定
2. **グローバル状態の追加**: dirty領域を追跡
3. **executeGlobalStep関数の修正**: 定期的な描画チェックポイントを追加
4. **描画関数の追加**: dirty領域のみを効率的に再描画

#### Realtime版 (`src/realtime/RealTimeCLIRunner.ts`)

1. **runFrameLoop関数の修正**: ステップループ内に描画チェックポイントを追加
2. **renderGridUpdateメソッドの抽出**: 重複する描画コードを共通化
3. **設定オプションの追加**: `drawInterval` パラメータで描画頻度を制御可能に

### パフォーマンス考慮事項

- **描画頻度の調整**: `DRAW_INTERVAL` は100-1000の範囲が適切
  - 小さすぎる（10以下）: 描画オーバーヘッドが大きい
  - 大きすぎる（10000以上）: 視覚的フィードバックが遅延
  
- **Web版の特別な考慮**:
  - Canvas API (`drawCell`) の呼び出しコストは比較的低い
  - しかし、複数ワーカーで同時描画する場合は注意が必要
  
- **Realtime版の特別な考慮**:
  - ターミナル出力 (`process.stdout.write`) はI/O bound
  - 差分描画レンダラー（GridDiffRenderer）は既に最適化されている
  - 過度な出力は画面のちらつきを引き起こす可能性

### テスト計画

修正後、以下のシナリオでテストを実施すべき:

1. **低速実行** (stepsPerFrame = 1-10):
   - すべてのPOKE操作が即座に反映されることを確認
   
2. **中速実行** (stepsPerFrame = 100-1000):
   - 描画頻度が適切で、パフォーマンス劣化がないことを確認
   
3. **高速実行** (stepsPerFrame = 10000-100000):
   - 視覚的フィードバックが適切に提供されることを確認
   - フレームレートが維持されることを確認
   
4. **複数ワーカー** (Web版のみ):
   - 複数ワーカーが同時にPOKEする場合の描画競合がないことを確認

## 関連ファイル

### 修正が必要なファイル

1. **src/index.ts** (Web版)
   - `poke()` 関数（行109-123）
   - `executeGlobalStep()` 関数（行238-276）

2. **src/realtime/RealTimeCLIRunner.ts** (Realtime版)
   - `runFrameLoop()` メソッド（行211-274）
   - `poke()` メソッド（行312-324）

### 影響を受ける可能性のあるファイル

- `src/workerInterpreter.ts`: POKEステートメントの実行ロジック（行489-507）
  - ただし、インタプリタ自体の修正は不要（pokeFnコールバック経由で外部制御）

## 結論

### 推奨アプローチ

**アプローチ1（適応的な描画頻度制御）を推奨**

理由:
- 実装が比較的シンプル
- パフォーマンスと視覚的フィードバックのバランスが良い
- 既存のアーキテクチャに影響が少ない
- 設定で描画頻度を調整可能

### 実装の優先順位

1. **高**: Realtime版の修正
   - CLIでの実行がメインユースケース
   - 影響範囲が明確
   
2. **中**: Web版の修正
   - ブラウザ環境での体験向上
   - 既存のdrawCell機構を活用

### 次のステップ

1. このドキュメントのレビューと承認
2. 実装の詳細設計（DRAW_INTERVALの最適値決定など）
3. テストケースの作成
4. Realtime版の実装とテスト
5. Web版の実装とテスト
6. ドキュメントの更新（README.mdなど）

## 補足: 代替案の検討

### なぜフレーム単位の描画から変更するのか？

現在の設計では、1フレーム = N ステップという固定的な関係があり、これは以下の前提に基づいている:
- グリッド状態は連続的に変化する
- 最終状態のみを描画すれば十分

しかし、WorkerScriptの実際のユースケース（特にアニメーションやリアルタイムグラフィックス）では:
- 中間状態も視覚的に重要
- POKEによる描画はユーザーの意図的なアクション
- ステップ数が大きい場合、フレーム間の遅延が顕著

したがって、「I/O操作（POKE）が発生したら適切に反映する」という設計に変更することで、より直感的でレスポンシブな実行環境を提供できる。

---

**作成日**: 2025年1月
**作成者**: GitHub Copilot CLI
**ブランチ**: vk/5cf8-dont-skip-i-o-st
