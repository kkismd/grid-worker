# WorkerScript リアルタイム機能 設計構想

## 📋 概要

WorkerScript Grid版にリアルタイム描画とインタラクティブ入力機能を追加し、静的なスクリプト実行環境から動的な対話型プログラミング環境へと進化させる。

## 🎯 目標

### 主要機能
1. **フレームベース描画**: グリッドの差分更新による高速再描画
2. **ノンブロッキング入力**: `K=$` によるリアルタイムキーボード入力
3. **トランスクリプト分離**: グリッドとテキスト出力の独立表示
4. **30FPS対応**: スムーズなアニメーション・ゲーム体験

### 期待される用途
- **🎮 ゲーム開発**: リアルタイム対戦、アクションゲーム
- **📊 データ可視化**: ライブチャート、動的グラフ
- **🎓 教育支援**: アルゴリズム可視化、インタラクティブ学習
- **🐛 デバッグ**: リアルタイム変数監視、ステップ実行

## 🏗️ 技術設計

### 1. フレームベース差分描画システム

#### アーキテクチャ
```typescript
class RealTimeGridRenderer extends GridRenderer {
    private lastFrame: number[] = new Array(10000).fill(0)
    private dirtyRegions: Set<number> = new Set()
    private frameBuffer: string = ''
    
    // 差分検出・描画
    renderDiff(currentFrame: number[], forceRedraw: boolean = false): string {
        const changes = this.detectChanges(currentFrame, forceRedraw)
        return this.generateEscapeSequences(changes)
    }
    
    // 最適化された変更検出
    private detectChanges(frame: number[], force: boolean): Change[] {
        const changes: Change[] = []
        
        for (let i = 0; i < 10000; i++) {
            if (force || frame[i] !== this.lastFrame[i]) {
                changes.push({
                    x: i % 100,
                    y: Math.floor(i / 100),
                    oldValue: this.lastFrame[i],
                    newValue: frame[i]
                })
                this.lastFrame[i] = frame[i]
            }
        }
        
        return changes
    }
    
    // ANSI エスケープシーケンス生成
    private generateEscapeSequences(changes: Change[]): string {
        let output = ''
        
        for (const change of changes) {
            // カーソル移動: ESC[line;columnH
            output += `\x1b[${change.y + 1};${change.x + 1}H`
            
            // 色付き文字描画（オプション）
            const char = this.valueToChar(change.newValue)
            const color = this.valueToColor(change.newValue)
            output += color + char + '\x1b[0m' // リセット
        }
        
        return output
    }
}
```

#### 最適化手法
- **差分検出**: フレーム間で変更された座標のみ更新
- **バッチ処理**: 連続する変更をまとめて処理
- **ダーティ領域管理**: 変更領域の効率的な追跡
- **エスケープシーケンス最適化**: 冗長な移動コマンドの削減

### 2. ノンブロッキングキーボード入力

#### 実装方式
```typescript
class KeyboardInputManager {
    private keyBuffer: number[] = []
    private isRawModeEnabled: boolean = false
    private keyHandlers: Map<number, () => void> = new Map()
    
    // Raw Mode 開始
    enableRawMode(): void {
        if (!process.stdin.isTTY) {
            throw new Error('TTY required for keyboard input')
        }
        
        process.stdin.setRawMode(true)
        process.stdin.resume()
        process.stdin.setEncoding('utf8')
        
        process.stdin.on('data', this.handleKeyPress.bind(this))
        this.isRawModeEnabled = true
        
        // Ctrl+C ハンドリング
        this.setupExitHandlers()
    }
    
    // キー入力処理
    private handleKeyPress(data: string): void {
        const keyCode = data.charCodeAt(0)
        
        // 特殊キー処理
        if (keyCode === 3) { // Ctrl+C
            this.gracefulExit()
            return
        }
        
        // バッファに追加
        this.keyBuffer.push(keyCode)
        
        // 最大バッファサイズ制限
        if (this.keyBuffer.length > 1000) {
            this.keyBuffer.shift()
        }
    }
    
    // K=$ の実装（WorkerScript システム変数）
    getKeyInput(): number {
        return this.keyBuffer.shift() || 0  // 0 = 入力なし
    }
    
    // 終了処理
    disableRawMode(): void {
        if (this.isRawModeEnabled && process.stdin.isTTY) {
            process.stdin.setRawMode(false)
            process.stdin.pause()
            this.isRawModeEnabled = false
        }
    }
    
    private setupExitHandlers(): void {
        process.on('SIGINT', this.gracefulExit.bind(this))
        process.on('exit', this.disableRawMode.bind(this))
    }
    
    private gracefulExit(): void {
        this.disableRawMode()
        console.log('\n終了しています...')
        process.exit(0)
    }
}
```

#### システム変数の拡張
```typescript
// WorkerInterpreter での実装
class WorkerInterpreter {
    private keyboardManager: KeyboardInputManager
    
    private initializeSystemVariables(): void {
        // 既存のシステム変数
        this.systemVariables.set('#', 0)  // プログラムカウンタ
        this.systemVariables.set('~', () => Math.floor(Math.random() * 32768))
        
        // 新規追加: キーボード入力
        this.systemVariables.set('K', () => this.keyboardManager.getKeyInput())
    }
}
```

### 3. トランスクリプト分離表示システム

#### 分割スクリーン設計
```
┌─ Grid Area (100x30) ───────────┬─ Transcript Area (40x30) ─┐
│ ████░░░░░░░░░░░░░░░░░░░░░░░░  │ > Program started         │
│ ░░████░░░░░░░░░░░░░░░░░░░░░░  │ > Grid initialized        │
│ ░░░░████░░░░░░░░░░░░░░░░░░░░  │ > User input: 65          │
│ ░░░░░░████░░░░░░░░░░░░░░░░░░  │ > Processing...            │
│ ░░░░░░░░████░░░░░░░░░░░░░░░░  │ > Result: Success          │
│ ░░░░░░░░░░████░░░░░░░░░░░░░░  │ > [DEBUG] X=50, Y=25       │
│ ░░░░░░░░░░░░████░░░░░░░░░░░░  │ > [DEBUG] Step: 1250       │
│ ░░░░░░░░░░░░░░████░░░░░░░░░░  │ > Waiting for input...     │
│ (グリッド表示領域)              │ (テキスト出力領域)           │
└─ Status: Running [30 FPS] ────┴─ Input: K=$ (ESC to exit) ─┘
```

#### 実装クラス
```typescript
class SplitScreenManager {
    private terminalWidth: number
    private terminalHeight: number
    private gridArea: AreaConfig
    private transcriptArea: AreaConfig
    
    constructor() {
        this.detectTerminalSize()
        this.calculateLayout()
    }
    
    private detectTerminalSize(): void {
        this.terminalWidth = process.stdout.columns || 140
        this.terminalHeight = process.stdout.rows || 40
    }
    
    private calculateLayout(): void {
        // グリッド領域（左側、2/3）
        this.gridArea = {
            x: 1,
            y: 1,
            width: Math.floor(this.terminalWidth * 0.67),
            height: this.terminalHeight - 2
        }
        
        // トランスクリプト領域（右側、1/3）
        this.transcriptArea = {
            x: this.gridArea.width + 2,
            y: 1,
            width: this.terminalWidth - this.gridArea.width - 2,
            height: this.terminalHeight - 2
        }
    }
    
    initializeDisplay(): void {
        // 画面クリア
        process.stdout.write('\x1b[2J\x1b[H')
        
        // 境界線描画
        this.drawBorders()
        
        // 各領域の初期化
        this.initializeGridArea()
        this.initializeTranscriptArea()
    }
    
    updateGrid(gridData: number[]): void {
        // グリッド領域内でのみ描画
        this.setViewport(this.gridArea)
        // ... グリッド描画ロジック
    }
    
    addTranscriptLine(text: string): void {
        // トランスクリプト領域でのスクロール表示
        this.setViewport(this.transcriptArea)
        // ... テキスト追加ロジック
    }
}
```

### 4. 統合リアルタイムランナー

#### メインクラス
```typescript
class RealTimeGridRunner extends GridRunner {
    private renderer: RealTimeGridRenderer
    private keyboard: KeyboardInputManager
    private screenManager: SplitScreenManager
    private transcriptBuffer: string[] = []
    private frameRate: number = 30 // FPS
    private isRunning: boolean = false
    
    async runRealTime(script: string): Promise<void> {
        await this.initializeRealTimeMode()
        
        try {
            const interpreter = this.createInterpreter()
            const generator = interpreter.run()
            
            this.startMainLoop(generator)
            await this.waitForCompletion(generator)
            
        } finally {
            await this.cleanupRealTimeMode()
        }
    }
    
    private async initializeRealTimeMode(): Promise<void> {
        // ターミナル設定
        this.keyboard.enableRawMode()
        this.screenManager.initializeDisplay()
        
        // フレームレート設定
        this.frameInterval = 1000 / this.frameRate
        this.isRunning = true
        
        console.log(`リアルタイムモード開始 (${this.frameRate} FPS)`)
    }
    
    private startMainLoop(generator: Generator): void {
        const frameStart = Date.now()
        
        // 1フレーム分のスクリプト実行
        const stepsPerFrame = this.calculateStepsPerFrame()
        for (let i = 0; i < stepsPerFrame && this.isRunning; i++) {
            const result = generator.next()
            if (result.done) {
                this.isRunning = false
                break
            }
        }
        
        // 画面更新
        this.updateDisplay()
        
        // フレームレート制御
        const frameTime = Date.now() - frameStart
        const delay = Math.max(0, this.frameInterval - frameTime)
        
        if (this.isRunning) {
            setTimeout(() => this.startMainLoop(generator), delay)
        }
    }
    
    private updateDisplay(): void {
        // グリッド差分更新
        const gridChanges = this.renderer.renderDiff(this.gridData)
        this.screenManager.updateGrid(this.gridData)
        
        // トランスクリプト更新
        if (this.transcriptBuffer.length > 0) {
            for (const line of this.transcriptBuffer) {
                this.screenManager.addTranscriptLine(line)
            }
            this.transcriptBuffer = []
        }
    }
    
    // ?= 出力をトランスクリプトバッファに追加
    protected addToTranscript(text: string): void {
        this.transcriptBuffer.push(text)
    }
}
```

## 🎮 使用例

### ゲーム開発例
```workerscript
: リアルタイム Snake ゲーム
?="Snake Game - WASD で移動, ESC で終了"

: 初期設定
X=50 Y=25    : プレイヤー位置
D=0          : 方向 (0:上 1:右 2:下 3:左)
S=0          : スコア

^GAME_LOOP
    : キー入力チェック
    K=$
    ;=K=119 D=0  : W = 上
    ;=K=97  D=3  : A = 左  
    ;=K=115 D=2  : S = 下
    ;=K=100 D=1  : D = 右
    ;=K=27  #=^END : ESC = 終了
    
    : 移動処理
    ;=D=0 Y=Y-1  : 上
    ;=D=1 X=X+1  : 右
    ;=D=2 Y=Y+1  : 下
    ;=D=3 X=X-1  : 左
    
    : 境界チェック
    ;=X<0   X=99
    ;=X>99  X=0
    ;=Y<0   Y=99  
    ;=Y>99  Y=0
    
    : 描画
    `=255        : プレイヤーを描画
    
    : スコア表示
    ?="Score: " ?=S
    
    : 少し待機（フレームレート調整）
    : ※実際のフレーム制御はランナーが行う
    
    #=^GAME_LOOP

^END
    ?="Game Over! Final Score: " ?=S
    #=-1
```

### データ可視化例
```workerscript
: リアルタイムサイン波
?="Sine Wave Visualization - Any key to exit"

T=0          : 時間
A=20         : 振幅

^WAVE_LOOP
    : 画面クリア（前フレームを消去）
    I=0,99
        J=0,99
            X=I Y=J
            `=0
        @=J
    @=I
    
    : サイン波描画
    I=0,99
        : sin(x + t) の計算（簡易版）
        R=(I*314/100+T*10)%628  : 角度（0-628 ≈ 0-2π）
        S=A*SIN_TABLE[R/10]     : サイン値
        
        Y=30+S                  : Y座標（中央+振幅）
        X=I
        `=255                   : 点を描画
    @=I
    
    : 時間進行
    T=T+1
    
    : キー入力チェック
    K=$
    ;=K>0 #=^END
    
    #=^WAVE_LOOP

^END
    ?="Visualization ended"
    #=-1
```

## 📊 実装スケジュール

### Phase 1: 基礎実装（3-4日）
- [x] RealTimeGridRenderer の基本実装
- [x] 差分検出アルゴリズム
- [x] ANSI エスケープシーケンス生成
- [x] 基本的な最適化

### Phase 2: キーボード入力（1-2日）
- [x] KeyboardInputManager 実装
- [x] Raw Mode 制御
- [x] K=$ システム変数追加
- [x] 安全な終了処理

### Phase 3: 画面分割（2-3日）
- [x] SplitScreenManager 実装
- [x] レイアウト計算
- [x] トランスクリプト表示
- [x] 境界線描画

### Phase 4: 統合・最適化（3-4日）
- [x] RealTimeGridRunner 統合
- [x] フレームレート制御
- [x] パフォーマンス最適化
- [x] エラーハンドリング

### Phase 5: テスト・ドキュメント（2-3日）
- [ ] 各種ターミナルでの動作確認
- [ ] サンプルゲーム・可視化の作成
- [ ] ユーザーガイド作成
- [ ] パフォーマンス測定

**総実装期間**: 11-16日

## 🎯 成功指標

### 技術的指標
- [ ] 30FPS で安定動作
- [ ] 100x100 グリッド全更新 < 16ms
- [ ] キー入力遅延 < 50ms
- [ ] メモリ使用量 < 100MB

### 機能的指標
- [ ] スムーズなアニメーション表示
- [ ] レスポンシブなキー入力
- [ ] 安定したフレームレート
- [ ] 複数ターミナルでの動作

### ユーザー体験指標
- [ ] 直感的な操作感
- [ ] 視認性の高い表示
- [ ] 学習コストの低さ
- [ ] デバッグの容易性

## 🔮 将来の拡張案

### 高度な入力
- **マウス入力**: クリック位置での POKE 操作
- **ゲームパッド**: 複数ボタン対応
- **ファイルウォッチ**: 外部ファイル変更の監視

### 描画機能
- **カラーパレット**: 256色・TrueColor 対応
- **レイヤーシステム**: 複数レイヤーでの描画
- **エフェクト**: フェード・ブラー・パーティクル

### パフォーマンス
- **GPU加速**: 可能な範囲での GPU 活用
- **並列処理**: Worker Threads での処理分散
- **予測描画**: 次フレームの先読み最適化

この設計により、WorkerScript は教育用途からゲーム開発、データ可視化まで幅広い領域で活用できるリアルタイム・インタラクティブプログラミング環境となります。