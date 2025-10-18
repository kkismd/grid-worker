# WorkerScript汎用スクリプト実行環境 実装プラン

## 📋 概要

Grid機能を持たない汎用のWorkerScriptランナーを実装し、NodeJSでのスクリプト実行環境を提供する。

## 🎯 目標

- **コア単純性保持**: WorkerInterpreterへの影響を最小限に抑制
- **Web版影響なし**: 既存のブラウザ版実装に一切影響を与えない
- **実装明解性**: 責任分離による分かりやすいアーキテクチャ
- **将来拡張性**: NodeJS固有機能の追加を容易にする

## 🏗️ アーキテクチャ設計

### 現在の構造
```
src/
├── workerInterpreter.ts     # 言語コア
├── cliRunner.ts            # Grid機能付きRunner
├── cli.ts                  # Grid版CLIエントリーポイント
└── gridRenderer.ts         # Grid表示機能
```

### 実装後の構造
```
src/
├── workerInterpreter.ts     # 言語コア（変更なし）
├── runners/
│   ├── baseRunner.ts        # 共通Runner基底クラス
│   ├── gridRunner.ts        # Grid機能付きRunner（現cliRunnerをリファクタ）
│   └── scriptRunner.ts      # 汎用ScriptRunner（新規実装）
├── cli.ts                  # Grid版CLI（gridRunner使用）
├── script-cli.ts           # 汎用版CLI（scriptRunner使用）
└── gridRenderer.ts         # Grid表示機能（変更なし）
```

## 🔧 実装戦略

### 1. POKE/PEEKダミー実装方式

**方針**: WorkerInterpreterコアを変更せず、POKE/PEEK操作をダミーメモリで処理

**利点**:
- ✅ WorkerInterpreterへの影響ゼロ
- ✅ 既存APIとの完全互換性
- ✅ Grid版からの段階的移行が可能
- ✅ POKE/PEEKを使うスクリプトがエラーにならない

**実装詳細**:
```typescript
class ScriptRunner {
    private dummyMemory: number[] = new Array(10000).fill(0);
    
    private peekDummy = (index: number): number => {
        return this.dummyMemory[index % 10000] || 0;
    }
    
    private pokeDummy = (x: number, y: number, value: number): void => {
        const index = ((x % 100) * 100 + (y % 100));
        this.dummyMemory[index] = value & 0xFF;
        
        if (this.config.verbose) {
            console.log(`[POKE] (${x},${y}) = ${value} [汎用版では表示されません]`);
        }
    }
}
```

### 2. 共通基底クラス設計

**BaseRunner抽象クラス**:
- 共通設定管理（CLIRunnerConfig）
- エラーハンドリング
- ログ出力機能
- スクリプト実行制御

**GridRunner（既存CLIRunnerをリファクタ）**:
- Grid表示機能
- 実際のPOKE/PEEK操作
- ASCII Grid レンダリング

**ScriptRunner（新規実装）**:
- ダミーPOKE/PEEK実装
- 汎用スクリプト実行
- NodeJS固有機能の拡張ポイント

## 📝 実装手順

### Phase 1: リファクタリング準備
1. **共通インターフェース抽出**
   - `RunnerConfig` インターフェース定義
   - `BaseRunner` 抽象クラス作成

2. **ディレクトリ構造整備**
   - `src/runners/` ディレクトリ作成
   - 既存ファイルの移動準備

### Phase 2: GridRunner分離
1. **既存CLIRunnerの移動**
   - `cliRunner.ts` → `runners/gridRunner.ts`
   - BaseRunnerを継承する形にリファクタ

2. **既存CLIの更新**
   - `cli.ts`でGridRunnerを使用するよう修正
   - インポートパスの更新

### Phase 3: ScriptRunner実装
1. **ScriptRunnerクラス作成**
   - BaseRunnerを継承
   - ダミーPOKE/PEEK実装
   - 汎用スクリプト実行機能

2. **新CLIエントリーポイント作成**
   - `script-cli.ts` 実装
   - コマンドライン引数解析
   - ScriptRunnerとの連携

### Phase 4: パッケージ統合
1. **package.json更新**
   - 新しいCLIコマンド追加
   - スクリプトエントリーポイント定義

2. **ドキュメント更新**
   - CLI.mdに汎用版の説明追加
   - 使用例とサンプル提供

## 🎯 新CLIコマンド仕様

### コマンド名
```bash
# Grid版（既存）
npm run cli -- script.ws

# 汎用版（新規）
npm run script -- script.ws
```

### オプション互換性
```bash
# 共通オプション
--debug, -d      : デバッグモード
--verbose, -v    : 詳細出力
--quiet, -q      : 静寂モード  
--unlimited      : 無制限実行
--output, -o     : 結果をJSONで出力

# Grid版専用
--interactive    : インタラクティブモード（グリッド表示付き）

# 汎用版専用
--memory-dump    : 実行後にダミーメモリの状態を表示
--node-features  : NodeJS固有機能の有効化（将来拡張用）
```

## 📊 出力仕様

### Grid版出力（変更なし）
```
マンデルブロ集合 ASCII ART ベンチマーク
[フラクタル描画]
📊 グリッド状態:
   0 1 2 3 4 5 6 7 8 9
   -------------------
0 |░ . . . . . . . . .
```

### 汎用版出力
```
TinyBasicマンデルブロ開始
222222222222222333333333333344444567D9F 544433...
[テキスト出力のみ、グリッド表示なし]
```

## 🧪 テスト戦略

### テスト対象
1. **BaseRunner**: 共通機能のテスト
2. **GridRunner**: Grid機能とPOKE/PEEKの正確性
3. **ScriptRunner**: ダミー実装の動作確認
4. **互換性**: 同じスクリプトが両環境で動作すること

### テストスクリプト
- `examples/mandelbrot-tinybasic.ws`: 両環境で同じ出力
- `examples/grid-test.ws`: POKE/PEEK動作確認用
- `examples/pure-calc.ws`: グリッド機能を使わない計算専用

## 🚀 リリース計画

### v1.0 (Grid版との共存)
- BaseRunner、GridRunner、ScriptRunner実装
- 新CLI（script-cli）の提供
- 既存機能の完全互換性保証

### v1.1 (機能拡張)
- ダミーメモリダンプ機能
- 詳細デバッグ出力
- NodeJS固有機能の拡張ポイント

### v2.0 (高度な機能)
- ファイルI/O機能（汎用版のみ）
- 外部ライブラリ連携
- REPLモード

## 🎨 Grid版高機能化の拡張案

### 🖼️ 視覚化・表示機能
```typescript
// カラーパレット対応
class ColorGridRenderer extends GridRenderer {
    renderToColorString(gridData: number[], palette: ColorPalette): string
    exportToPNG(gridData: number[], filename: string): void
    exportToSVG(gridData: number[], filename: string): void
}

// アニメーション対応
class AnimatedGridRunner extends GridRenderer {
    recordFrame(): void                    // フレーム記録
    exportToGIF(filename: string): void    // GIFアニメ出力
    playAnimation(fps: number): void       // ターミナルでアニメ再生
}
```

### 🎮 インタラクティブ機能
```typescript
// リアルタイム編集
interface InteractiveGridRunner {
    enableMouseInput(): void               // マウスクリック→POKE
    enableKeyboardInput(): void            // キーボード→座標移動
    setDrawMode(mode: DrawMode): void      // 描画モード切替
    showCursor(x: number, y: number): void // カーソル表示
}

// ゲーム機能
class GameGridRunner extends GridRunner {
    setFPS(fps: number): void              // フレームレート制御
    handleCollisionDetection(): boolean    // 当たり判定
    playSound(frequency: number): void     // ビープ音再生
}
```

### 📊 データ分析・デバッグ機能
```typescript
// グリッド分析
interface GridAnalytics {
    calculateHistogram(): Map<number, number>     // 値の分布
    findHotspots(): Array<{x: number, y: number}> // アクティブ領域
    measureComplexity(): number                   // 複雑度計算
    detectPatterns(): PatternInfo[]               // パターン検出
}

// デバッグ支援
class DebugGridRunner extends GridRunner {
    setBreakpoint(x: number, y: number): void     // 座標ブレークポイント
    watchVariable(variable: string): void         // 変数監視
    showHeatmap(): void                          // アクセス頻度表示
    exportExecutionTrace(): ExecutionTrace       // 実行トレース
}
```

### 🔗 外部連携機能
```typescript
// ファイルI/O
interface GridFileOperations {
    loadFromImage(filename: string): void         // 画像→グリッド変換
    saveToImage(filename: string, format: ImageFormat): void
    loadFromCSV(filename: string): void           // CSV→グリッド
    saveToCSV(filename: string): void             // グリッド→CSV
    importFromJSON(data: GridData): void          // JSONデータ読込
}

// ネットワーク機能
class NetworkGridRunner extends GridRunner {
    shareGrid(url: string): void                  // グリッド共有
    loadFromURL(url: string): void                // リモートグリッド読込
    enableCollaboration(): void                   // 複数人編集
}
```

### 🧮 数値計算・シミュレーション
```typescript
// 物理シミュレーション
class PhysicsGridRunner extends GridRunner {
    enableGravity(strength: number): void         // 重力シミュレーション
    enableFluidDynamics(): void                   // 流体力学
    enableCellularAutomata(): void                // セルオートマトン
    enableParticleSystem(): void                  // パーティクルシステム
}

// 数学的機能
interface MathGridOperations {
    applyConvolution(kernel: number[][]): void    // 畳み込み演算
    fourierTransform(): ComplexGrid               // フーリエ変換
    findGradient(): GradientGrid                  // 勾配計算
    detectEdges(): void                          // エッジ検出
}
```

### 🎯 専門領域特化
```typescript
// ゲーム開発支援
class GameDevGridRunner extends GridRunner {
    enableSpriteSystem(): void                    // スプライト管理
    setupTileMap(tileSize: number): void          // タイルマップ
    enableLayerSystem(): void                     // レイヤー管理
    addCollisionMap(): void                       // 当たり判定マップ
}

// データ可視化
class DataVizGridRunner extends GridRunner {
    plotGraph(data: number[]): void               // グラフ描画
    showHistogram(data: number[]): void           // ヒストグラム
    renderHeatmap(data: number[][]): void         // ヒートマップ
    createChartFromGrid(): Chart                  // チャート生成
}

// 教育・学習支援
class EduGridRunner extends GridRunner {
    showAlgorithmStep(step: AlgorithmStep): void  // アルゴリズム可視化
    highlightPath(path: Point[]): void            // 経路ハイライト
    enableStepMode(): void                        // ステップ実行
    addAnnotations(notes: string[]): void         // 注釈表示
}
```

### 🛠️ 開発者ツール
```typescript
// プロファイリング
class ProfilerGridRunner extends GridRunner {
    enablePerformanceProfile(): void             // パフォーマンス測定
    measureMemoryUsage(): MemoryStats             // メモリ使用量
    analyzeComplexity(): ComplexityReport         // 計算量解析
    generateOptimizationSuggestions(): string[]  // 最適化提案
}

// テスト支援
class TestGridRunner extends GridRunner {
    recordTestCase(): TestCase                    // テストケース記録
    compareWithExpected(expected: number[]): TestResult
    generateRandomInput(seed: number): void       // ランダム入力生成
    runBenchmark(iterations: number): BenchmarkResult
}
```

### 📦 実装優先度

#### 🥇 高優先（v2.0候補）
- **リアルタイム描画**: フレーム差分更新・エスケープシーケンス
- **ノンブロッキング入力**: `K=$` でキーボード入力取得
- **トランスクリプト分離**: グリッドとテキスト出力の独立表示
- **カラー表示**: 8色/16色/256色対応

#### 🎯 最初のマイルストーン詳細分析

##### 🖼️ フレームごとグリッド再描画

**技術仕様**:
```typescript
class RealTimeGridRenderer {
    private lastFrame: number[] = new Array(10000).fill(0)
    private cursorPosition: {x: number, y: number} = {x: 0, y: 0}
    
    // 差分更新による高速描画
    renderDiff(currentFrame: number[], force: boolean = false): string {
        const changes: Array<{x: number, y: number, value: number}> = []
        
        for (let i = 0; i < 10000; i++) {
            if (force || currentFrame[i] !== this.lastFrame[i]) {
                changes.push({
                    x: i % 100,
                    y: Math.floor(i / 100),
                    value: currentFrame[i]
                })
            }
        }
        
        return this.generateEscapeSequences(changes)
    }
    
    // ANSI エスケープシーケンス生成
    private generateEscapeSequences(changes: Change[]): string {
        let output = ''
        for (const change of changes) {
            // カーソル移動: \x1b[{y+1};{x+1}H
            output += `\x1b[${change.y + 1};${change.x + 1}H`
            // 文字描画
            output += this.valueToChar(change.value)
        }
        return output
    }
}
```

**実装難易度**: 🟡 **中程度**
- ANSI エスケープシーケンス知識が必要
- ターミナル互換性の考慮が必要
- パフォーマンス最適化が重要

##### ⌨️ ノンブロッキングキーボード入力

**技術仕様**:
```typescript
class KeyboardInputManager {
    private keyBuffer: number[] = []
    private isRawMode: boolean = false
    
    // ノンブロッキング入力開始
    enableRawMode(): void {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true)
            process.stdin.resume()
            process.stdin.setEncoding('utf8')
            
            process.stdin.on('data', (key: string) => {
                this.keyBuffer.push(key.charCodeAt(0))
            })
            this.isRawMode = true
        }
    }
    
    // K=$ の実装
    getKey(): number {
        return this.keyBuffer.shift() || 0  // 0 = キー入力なし
    }
    
    // 終了処理
    disableRawMode(): void {
        if (this.isRawMode && process.stdin.isTTY) {
            process.stdin.setRawMode(false)
            process.stdin.pause()
            this.isRawMode = false
        }
    }
}
```

**実装難易度**: 🟢 **比較的容易**
- Node.js標準APIで実現可能
- クリーンアップ処理が重要

##### 📄 トランスクリプト表現の設計案

**方案1: 分割スクリーン方式**
```
┌─ Grid (100x30) ────────────────┬─ Transcript (40x30) ─┐
│ ████░░░░                      │ > Hello World!        │
│ ░░████                        │ > Input: 65           │
│ ░░░░████                      │ > Processing...       │
│ ░░░░░░████                    │ > Result: OK          │
│                               │                       │
└───────────────────────────────┴───────────────────────┘
```

**方案2: オーバーレイ方式**
```
████░░░░                    ┌─ Transcript ──┐
░░████                      │ > Hello World! │
░░░░████  ← Grid (背景)      │ > Input: 65    │
░░░░░░████                  │ > Processing.. │
                            └────────────────┘
```

**方案3: 時間分割方式**
```bash
# --transcript-mode オプションで制御
npm run cli -- script.ws --realtime --transcript-overlay
npm run cli -- script.ws --realtime --transcript-split
npm run cli -- script.ws --realtime --transcript-log
```

**推奨**: **方案1 (分割スクリーン)**
- グリッドとトランスクリプトの独立性
- デバッグ時の可読性
- ターミナルサイズ対応

##### 🏗️ 統合アーキテクチャ

```typescript
class RealTimeGridRunner extends GridRunner {
    private renderer: RealTimeGridRenderer
    private keyboard: KeyboardInputManager
    private transcriptManager: TranscriptManager
    private refreshRate: number = 30 // FPS
    
    async runRealTime(script: string): Promise<void> {
        this.keyboard.enableRawMode()
        this.setupDisplay()
        
        const interpreter = this.createInterpreter()
        const generator = interpreter.run()
        
        // メインループ
        const interval = setInterval(() => {
            // 1フレーム分実行
            this.executeFrame(generator)
            // 画面更新
            this.updateDisplay()
        }, 1000 / this.refreshRate)
        
        // 実行完了まで待機
        await this.waitForCompletion(generator)
        
        clearInterval(interval)
        this.keyboard.disableRawMode()
        this.restoreDisplay()
    }
    
    private setupDisplay(): void {
        // ターミナルクリア
        process.stdout.write('\x1b[2J\x1b[H')
        // 分割レイアウト初期化
        this.transcriptManager.initSplitView()
    }
    
    private updateDisplay(): void {
        // グリッド差分更新
        const gridUpdate = this.renderer.renderDiff(this.gridData)
        // トランスクリプト更新
        const transcriptUpdate = this.transcriptManager.getUpdate()
        
        process.stdout.write(gridUpdate + transcriptUpdate)
    }
}
```

##### 📊 実装難易度評価

| 機能 | 難易度 | 主な課題 | 推定工数 |
|------|--------|----------|----------|
| **差分描画** | 🟡 中 | ANSI制御、最適化 | 2-3日 |
| **キー入力** | 🟢 易 | rawMode制御 | 1日 |
| **トランスクリプト分離** | 🟡 中 | レイアウト管理 | 2-3日 |
| **統合・テスト** | 🟠 高 | ターミナル互換性 | 3-4日 |
| **合計** | 🟡 中 | - | **8-11日** |

##### 🎯 段階的実装プラン

**Phase 1**: 基本差分描画（2-3日）
```typescript
// 最小限の差分更新実装
class BasicDiffRenderer {
    renderChangesOnly(oldGrid: number[], newGrid: number[]): void
}
```

**Phase 2**: キーボード入力（1日）
```typescript
// K=$ システム変数の実装
interpreter.setSystemVariable('K', () => keyboard.getKey())
```

**Phase 3**: トランスクリプト分離（2-3日）
```typescript
// 分割画面レイアウト
class SplitScreenManager {
    setupGridArea(width: number, height: number): void
    setupTranscriptArea(width: number, height: number): void
}
```

**Phase 4**: 統合・最適化（3-4日）
- パフォーマンス調整
- ターミナル互換性テスト  
- エラーハンドリング

##### 🚀 期待される効果

- **ゲーム開発**: リアルタイム対戦ゲーム作成可能
- **データ可視化**: ライブチャート・アニメーション
- **教育用途**: アルゴリズム可視化・インタラクティブ学習
- **デバッグ**: リアルタイム変数監視・ステップ実行

この実装により、WorkerScriptは**静的なスクリプト言語**から**リアルタイム対話型環境**へと大きく進化します。

#### 🥈 中優先（v2.5候補）
- **画像I/O**: JPG/PNG読み込み・変換
- **データ分析**: ヒストグラム・統計情報
- **デバッグ支援**: ブレークポイント・変数監視
- **物理シミュレーション**: 重力・流体

#### 🥉 低優先（v3.0以降）
- **ネットワーク機能**: リモート共有・協調編集
- **高度な数学演算**: FFT・畳み込み
- **ゲーム開発特化**: スプライト・サウンド
- **機械学習連携**: TensorFlow.js統合

### 🎨 拡張アーキテクチャ
```typescript
// プラグイン方式での拡張
interface GridRunnerPlugin {
    name: string
    initialize(runner: GridRunner): void
    execute(command: string, args: any[]): any
    cleanup(): void
}

class ExtendedGridRunner extends GridRunner {
    private plugins: Map<string, GridRunnerPlugin> = new Map()
    
    loadPlugin(plugin: GridRunnerPlugin): void
    executePlugin(name: string, command: string, args: any[]): any
    listPlugins(): string[]
}

## 🔄 移行ガイド

### 既存ユーザー
- Grid版は完全に動作継続
- 新機能は汎用版で提供
- 段階的な移行が可能

### 新規ユーザー
- Grid機能が必要な場合: Grid版を使用
- テキスト処理のみ: 汎用版を推奨
- 学習目的: どちらでも可（機能差の説明提供）

## 📚 ドキュメント更新

1. **CLI.md**: 汎用版の使用方法追加
2. **README.md**: 2つのCLI版の違い説明
3. **新規作成**: SCRIPT-CLI.md（汎用版専用ガイド）

## ✅ 成功指標

- [ ] WorkerInterpreterコアへの変更がゼロ
- [ ] 既存Grid版の動作に影響なし
- [ ] 汎用版で全サンプルスクリプトが動作
- [ ] ドキュメントが整備され、ユーザーが選択可能
- [ ] テストカバレッジが既存レベルを維持