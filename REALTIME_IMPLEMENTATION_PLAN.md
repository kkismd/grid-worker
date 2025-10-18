# WorkerScript リアルタイム機能 実装計画

## 📋 エグゼクティブサマリー

WorkerScriptにリアルタイム機能を段階的に追加し、静的スクリプト実行環境から動的インタラクティブ環境へ進化させる。

**実装方針**: MVP（最小実行可能製品）から始め、段階的に機能を拡張

## 🎯 実装フェーズ

### Phase 0: 基盤整備（準備フェーズ）✅
**目標**: リアルタイム実装のための基盤を整える  
**期間**: 1-2日

- [x] 配列・スタック機能の実装完了
- [x] MemorySpace抽象化完了
- [x] パーサー・インタープリター安定化
- [ ] 現在のGridRunner構造の分析
- [ ] リアルタイム機能の設計レビュー

### Phase 1: ノンブロッキングキーボード入力（MVP）✅
**目標**: `A=$` (任意の変数) でキー入力を取得  
**期間**: 2-3日  
**優先度**: 最高  
**状態**: ✅ 完了 (2025-10-18)

#### 実装内容
```typescript
// KeyboardInput クラスでRaw Mode制御
class KeyboardInput {
    private keyBuffer: number[] = []  // FIFO queue (max 1000)
    
    getKey(): number {
        return this.keyBuffer.shift() || 0
    }
}

// RealTimeCLIRunner でフレームレート制御
class RealTimeCLIRunner {
    private config = {
        frameRate: 30,        // 30 FPS
        stepsPerFrame: 1000   // 1フレーム1000ステップ
    }
}
```

#### 技術的アプローチ
1. ✅ **Raw Mode制御**: `process.stdin.setRawMode(true)`
2. ✅ **キーバッファ**: FIFO queue で入力を保持 (max 1000)
3. ✅ **安全な終了**: Ctrl+C, SIGINT, exitのハンドリング
4. ✅ **エラー処理**: TTY環境チェック
5. ✅ **フレームレート制御**: 30 FPS、async/await で非ブロッキング
6. ✅ **既存$変数活用**: K=$ ではなく A=$, B=$ 等で入力受信

#### 成功基準
- ✅ キー入力が`A=$`で取得できる
- ✅ Ctrl+Cで正常終了できる
- ✅ 複数キーの連続入力に対応
- ✅ TTYでない環境でもエラーにならない
- ✅ ビジーループなし（30 FPS制御）
- ✅ CPU使用率 3-10% (100%にならない)

#### 実装ファイル
- ✅ `src/realtime/KeyboardInput.ts` (200行)
- ✅ `src/realtime/RealTimeCLIRunner.ts` (233行)
- ✅ `src/__tests__/realtime/KeyboardInput.test.ts`
- ✅ `src/__tests__/realtime/RealTimeCLIRunner.test.ts`
- ✅ `src/cli.ts` に --realtime フラグ統合
- ✅ サンプルプログラム 3個更新

#### サンプルプログラム
```workerscript
: Simple Key Echo
^LOOP
    A=$
    ;=A>0 ?="Key: " ?=A /
    ;=A=27 #=^END  : ESC to exit
    #=^LOOP

^END
    ?="Program ended"
    #=-1
```

#### 実行方法
```bash
npm run cli -- examples/realtime_tests/01-key-echo.ws --realtime
npm run cli -- examples/realtime_tests/03-wasd-movement.ws --realtime --show-fps
```

---

### Phase 2: グリッド差分更新（ターミナル版）
**目標**: ANSIエスケープシーケンスでグリッド差分描画  
**期間**: 3-4日  
**優先度**: 高

#### 実装内容
```typescript
class GridDiffRenderer {
    private lastFrame: Int16Array
    private dirtyRegions: Set<number>
    
    // 変更された座標のみ更新
    renderDiff(gridData: Int16Array): string {
        const changes = this.detectChanges(gridData)
        return this.generateANSI(changes)
    }
    
    private generateANSI(changes: Change[]): string {
        let output = ''
        for (const {x, y, value} of changes) {
            // ESC[line;columnH でカーソル移動
            output += `\x1b[${y+1};${x+1}H${this.valueToChar(value)}`
        }
        return output
    }
}
```

#### 技術的アプローチ
1. **フレームバッファ**: 前回のグリッド状態を保持
2. **差分検出**: XOR演算での高速比較
3. **ANSIエスケープ**: カーソル移動と文字描画
4. **バッチ最適化**: 連続領域のまとめ描画

#### 成功基準
- [ ] 100x100グリッドの差分更新 < 16ms
- [ ] ちらつきのない描画
- [ ] メモリ使用量が適切（<10MB追加）

---

### Phase 3: フレームレート制御
**目標**: 安定した30FPS実行  
**期間**: 2-3日  
**優先度**: 中

#### 実装内容
```typescript
class RealTimeRunner {
    private frameRate: number = 30
    private stepsPerFrame: number
    
    async runRealTime(script: string): Promise<void> {
        const interpreter = new WorkerInterpreter(...)
        const generator = interpreter.run()
        
        this.startFrameLoop(generator)
    }
    
    private startFrameLoop(gen: Generator): void {
        const frameStart = Date.now()
        
        // 1フレーム分実行
        for (let i = 0; i < this.stepsPerFrame; i++) {
            const result = gen.next()
            if (result.done) {
                this.cleanup()
                return
            }
        }
        
        // 次フレームをスケジュール
        const elapsed = Date.now() - frameStart
        const delay = Math.max(0, 1000/this.frameRate - elapsed)
        setTimeout(() => this.startFrameLoop(gen), delay)
    }
}
```

#### 技術的アプローチ
1. **適応的ステップ数**: FPS維持のための動的調整
2. **タイムスタンプ管理**: 高精度タイマー使用
3. **遅延補償**: フレームスキップとキャッチアップ

---

### Phase 4: トランスクリプト分離（オプション）
**目標**: グリッドとテキスト出力の分離表示  
**期間**: 2-3日  
**優先度**: 中（後回し可能）

#### 簡易版アプローチ
```
┌─ Grid (100x100) ─────┐
│ (グリッド表示)        │
│                       │
├─ Transcript ─────────┤
│ > Output line 1       │
│ > Output line 2       │
└───────────────────────┘
```

---

## 🚀 MVP実装スコープ（Phase 1 Focus）

### 必須機能
1. ✅ `K=$` システム変数でキー入力取得
2. ✅ Raw Modeの安全な制御
3. ✅ 既存GridRunnerとの統合

### 非必須（後回し）
- ❌ 画面分割
- ❌ 差分描画（まずは全更新でOK）
- ❌ 30FPS制御（まずは無制限でOK）
- ❌ カラー出力

## 📁 実装ファイル構成

```
src/
├── realtime/                    # 新規ディレクトリ
│   ├── KeyboardInput.ts        # Phase 1: キーボード入力管理
│   ├── GridDiffRenderer.ts     # Phase 2: 差分描画
│   ├── RealTimeRunner.ts       # Phase 3: フレーム制御
│   └── index.ts                # エクスポート
├── workerInterpreter.ts        # K=$ システム変数追加
└── index.ts                    # CLI統合

__tests__/
└── realtime/                    # リアルタイム機能のテスト
    ├── KeyboardInput.test.ts
    └── integration.test.ts

examples/
└── realtime_tests/              # リアルタイムデモ
    ├── 01-key-echo.ws
    ├── 02-simple-game.ws
    └── 03-animation.ws
```

## 🎮 Phase 1 実装例（MVP）

### サンプル1: キーエコー
```workerscript
: Key Echo Program
?="Press keys (ESC to exit)" /

^LOOP
    K=$
    ;=K>0 ?="Pressed: " ?=K /
    ;=K=27 #=^END
    #=^LOOP

^END
    ?="Goodbye!" /
    #=-1
```

### サンプル2: 簡易カウンター
```workerscript
: Counter with Keyboard Control
C=0
?="Press + to increment, - to decrement, ESC to exit" /

^LOOP
    K=$
    ;=K=43 C=C+1  : + key
    ;=K=45 C=C-1  : - key
    ;=K=27 #=^END : ESC
    
    ;=K>0 ?="Counter: " ?=C /
    
    #=^LOOP

^END
    ?="Final count: " ?=C /
    #=-1
```

## ✅ Phase 1 実装チェックリスト

### 設計
- [ ] KeyboardInput クラス設計レビュー
- [ ] システム変数 K の仕様確定
- [ ] エラーハンドリング戦略決定

### 実装
- [ ] KeyboardInput.ts 作成
- [ ] Raw Mode 制御実装
- [ ] キーバッファ実装
- [ ] 終了処理実装
- [ ] WorkerInterpreter に K=$ 追加
- [ ] GridRunner との統合

### テスト
- [ ] ユニットテスト作成
- [ ] 手動テスト（実際のキー入力）
- [ ] エッジケース確認（Ctrl+C, 非TTY環境）

### ドキュメント
- [ ] API ドキュメント
- [ ] サンプルコード（3個以上）
- [ ] ユーザーガイド更新

## 🎯 成功指標（Phase 1）

### 技術的
- [ ] キー入力遅延 < 50ms
- [ ] メモリリーク無し
- [ ] 安全な終了（100%成功）
- [ ] 既存テスト全てパス

### ユーザー体験
- [ ] 直感的な動作
- [ ] レスポンシブな入力
- [ ] 明確なエラーメッセージ

## 📊 次のステップ

1. **Phase 1 実装開始**: KeyboardInput.ts の骨格作成
2. **Raw Mode調査**: Node.jsでのベストプラクティス確認
3. **プロトタイプ作成**: 最小限の動作確認
4. **統合**: WorkerInterpreter への組み込み

---

**最終目標**: Phase 1完了後、実際に動くインタラクティブなWorkerScriptプログラムが書ける状態にする
